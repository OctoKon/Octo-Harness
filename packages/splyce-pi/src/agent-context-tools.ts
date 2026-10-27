// Read-only agent tools over the workspace code index (@splyce/index) and the
// optional memory module (@splyce/memory), in the same shape as the workspace
// tools (name, description, parameters, execute -> text, result -> text +
// summary). Everything is bound to one admitted workspace root, output is
// capped, and every output is scrubbed. The index and memory are passed in
// structurally: this package cannot import them (memory depends on it).

export type Redactor = (text: string) => string;

/** Matches turn.tool_outcome.summary; bytes is the raw size before the output cap. */
export interface ToolSummary {
  exitCode?: number | null;
  durationMs: number;
  bytes: number;
  truncated: boolean;
  preview: string;
}
export interface ToolResult {
  text: string;
  summary: ToolSummary;
}
export interface ContextTool {
  name: string;
  description: string;
  readOnly: true;
  parameters: Record<string, unknown>;
  execute(
    args: Record<string, unknown>,
    signal?: AbortSignal,
    actionId?: string,
  ): Promise<string>;
  result(
    args: Record<string, unknown>,
    signal?: AbortSignal,
    actionId?: string,
  ): Promise<ToolResult>;
}

/** Structural view of @splyce/index codeIndexTools(index) output. */
export interface CodeIndexToolLike {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: unknown): Promise<unknown>;
}
/** Structural view of @splyce/memory Memory. */
export interface MemoryLike {
  query(
    scopeId: string,
    text: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<
    readonly {
      observationId: string;
      text: string;
      sourceIds: readonly string[];
      score: number;
      createdAt: string;
    }[]
  >;
  capture(scopeId: string, sessionId: string): readonly unknown[];
}

export type ContextToolErrorCode =
  "WORKSPACE_ESCAPE" | "ROOT_MISMATCH" | "BAD_ARGS" | "ABORTED";
export class ContextToolError extends Error {
  readonly code: ContextToolErrorCode;
  constructor(code: ContextToolErrorCode, message: string) {
    super(message);
    this.name = "ContextToolError";
    this.code = code;
  }
}

export interface AgentContextToolsOptions {
  /** Admitted canonical absolute workspace root. */
  workspaceRoot: string;
  /** The code index; its root must be the admitted root. */
  index: { root: string };
  /** codeIndexTools(index). */
  codeTools: readonly CodeIndexToolLike[];
  /** Enables memory_search; omit when the memory module is not installed. */
  memory?: MemoryLike;
  /** Memory scope bound by the host, never supplied by the model. */
  scopeId?: string;
  /** Applied to every output; the host passes its live-secret redactor over the built-in scrub. */
  redact: Redactor;
}

/** Same 64 KB cap as the index tools. */
export const MAX_OUTPUT_BYTES = 64 * 1024;
export const MEMORY_MAX_RESULTS = 20;
export const MEMORY_MAX_TEXT_CHARS = 2000;
const PREVIEW = 2048;

const fail = (code: ContextToolErrorCode, message: string): never => {
  throw new ContextToolError(code, message);
};
const normRoot = (p: string): string => {
  const s = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[a-z]:/i.test(s) ? s.toLowerCase() : s;
};
/** Relative, no `..` segment, no drive/UNC/absolute prefix, no NUL. */
const confined = (value: unknown, what: string): void => {
  if (typeof value !== "string" || value === "")
    return fail("BAD_ARGS", `${what} must be a non-empty string`);
  const v = value.replace(/\\/g, "/");
  if (
    v.includes("\0") ||
    v.startsWith("/") ||
    /^[a-z]:/i.test(v) ||
    v.split("/").includes("..")
  )
    fail("WORKSPACE_ESCAPE", `${what} escapes the workspace`);
};
const PATH_ARGS = ["path", "target", "pathGlob"] as const;

const encoder = new TextEncoder();
function cap(text: string): {
  text: string;
  truncated: boolean;
  bytes: number;
} {
  const bytes = encoder.encode(text);
  if (bytes.length <= MAX_OUTPUT_BYTES)
    return { text, truncated: false, bytes: bytes.length };
  return {
    text: new TextDecoder().decode(bytes.slice(0, MAX_OUTPUT_BYTES)),
    truncated: true,
    bytes: bytes.length,
  };
}

export function createAgentContextTools(
  options: AgentContextToolsOptions,
): readonly ContextTool[] {
  const { workspaceRoot, index, codeTools, memory, scopeId, redact } = options;
  if (normRoot(index.root) !== normRoot(workspaceRoot))
    fail("ROOT_MISMATCH", "code index is not bound to the admitted workspace");

  const tool = (
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    run: (
      args: Record<string, unknown>,
      signal?: AbortSignal,
    ) => Promise<string>,
  ): ContextTool => {
    const result = async (
      args: Record<string, unknown>,
      signal?: AbortSignal,
    ): Promise<ToolResult> => {
      if (signal?.aborted) fail("ABORTED", "aborted");
      if (!args || typeof args !== "object" || Array.isArray(args))
        fail("BAD_ARGS", "tool arguments must be an object");
      const started = Date.now();
      // Scrub the whole text before capping so a secret straddling the cut is never half-kept.
      const out = cap(redact(await run(args, signal)));
      return {
        text: out.text,
        summary: {
          durationMs: Date.now() - started,
          bytes: out.bytes,
          truncated: out.truncated,
          preview: out.text.slice(0, PREVIEW),
        },
      };
    };
    return {
      name,
      description,
      readOnly: true,
      parameters,
      execute: async (args, signal) => (await result(args, signal)).text,
      result,
    };
  };

  const code = codeTools.map((t) =>
    tool(t.name, t.description, t.parameters, async (args) => {
      for (const k of PATH_ARGS)
        if (args[k] !== undefined) confined(args[k], k);
      return JSON.stringify(await t.execute(args));
    }),
  );
  if (memory === undefined) return Object.freeze(code);
  if (scopeId === undefined || scopeId === "")
    return fail("BAD_ARGS", "scopeId is required with memory");
  return Object.freeze([
    ...code,
    tool(
      "memory_search",
      "Search cited memory observations captured from earlier turns of this workspace (read-only). Each result lists the source event ids it cites.",
      {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 512 },
          limit: { type: "integer", minimum: 1, maximum: MEMORY_MAX_RESULTS },
        },
      },
      async (args, signal) => {
        const { query, limit = 5 } = args;
        if (typeof query !== "string" || query === "" || query.length > 512)
          return fail("BAD_ARGS", "query must be a string of 1-512 chars");
        if (
          typeof limit !== "number" ||
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > MEMORY_MAX_RESULTS
        )
          return fail(
            "BAD_ARGS",
            `limit must be an integer 1-${MEMORY_MAX_RESULTS}`,
          );
        const hits = await memory.query(scopeId, query, limit, signal);
        return JSON.stringify({
          results: hits.slice(0, MEMORY_MAX_RESULTS).map((h) => ({
            observationId: h.observationId,
            text: h.text.slice(0, MEMORY_MAX_TEXT_CHARS),
            sourceIds: h.sourceIds,
            score: h.score,
            createdAt: h.createdAt,
          })),
        });
      },
    ),
  ]);
}

/**
 * After-turn memory capture: folds the session's newly committed durable
 * events into cited observations. Returns how many were captured. Errors
 * propagate; the caller decides whether a capture failure blocks the turn.
 *
 * Wired by native factory: not called from anywhere in this package.
 */
export function captureMemoryAfterTurn(
  memory: Pick<MemoryLike, "capture">,
  scopeId: string,
  sessionId: string,
): number {
  return memory.capture(scopeId, sessionId).length;
}
