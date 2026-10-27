// Tool dispatch: workspace tools (#161) and read-only agent context tools wired
// into a Pi session so that EVERY effect goes through NativePolicy.execute
// (grants, once-consume, receipts). Pi's loop calls the admission object bound
// to each tool: reserve -> prepare(validated args) -> finish -> execute. The
// adapter below maps those onto NativePolicy and mints the permit and the
// once grant only after the arguments are validated (the digest binds them).
//
// No Pi import: the host injects the bound session, its tools, `bindTool`
// (Pi's bindSplyceToolAdmission) and the native ports, so this module is a thin
// seam the engine factory only has to wire.

import { randomUUID } from "node:crypto";
import {
  CONTRACT_VERSION,
  PROTOCOL_VERSION,
  type GrantRecord,
  type SplyceEventDraft,
} from "./contracts.js";
import {
  AdmissionError,
  actionArgumentsDigest,
  type ActionPermit,
  type ExecuteEvents,
  type NativePolicy,
} from "./policy.js";
import type { CallerContext, Store, WorkspaceOwnership } from "./store.js";
import {
  WorkspaceToolError,
  createWorkspaceTools,
  scrubSecrets,
  type Act,
  type GrantPort,
  type ReceiptPort,
  type ToolSummary,
  type WorkspacePort,
  type WorkspaceTool,
} from "./workspace-tools.js";
import {
  ContextToolError,
  captureMemoryAfterTurn,
  createAgentContextTools,
  type AgentContextToolsOptions,
  type ContextTool,
  type MemoryLike,
} from "./agent-context-tools.js";

type Capability = Extract<
  GrantRecord["capability"],
  "fs.read" | "fs.write" | "shell.run"
>;
const CAPABILITY: Readonly<Record<string, Capability>> = {
  read: "fs.read",
  ls: "fs.read",
  find: "fs.read",
  grep: "fs.read",
  write: "fs.write",
  edit: "fs.write",
  bash: "shell.run",
  powershell: "shell.run",
};
const ONCE: ReadonlySet<Capability> = new Set(["fs.write", "shell.run"]);
const PREVIEW_MAX = 2048;
const ARGS_SUMMARY_MAX = 512;
const UNAVAILABLE = "[unavailable]";

export class ToolDispatchError extends Error {
  readonly code:
    | "TOOL_REGISTRY_FROZEN"
    | "TOOL_REGISTRY_FOREIGN"
    | "SESSION_REGISTRATION_FAILED";
  constructor(code: ToolDispatchError["code"]) {
    super(code);
    this.name = "ToolDispatchError";
    this.code = code;
  }
}

/** Shape of one tool as the Pi session consumes it (the factory adds label/schema typing). */
export interface DispatchTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    toolCallId: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<DispatchResult>;
}
export interface DispatchResult {
  content: { type: "text"; text: string }[];
  details: { summary?: ToolSummary; code?: string };
  isError?: boolean;
}

/** Pi's SplyceToolAdmission, restated structurally. */
export interface ToolAdmission {
  check(
    toolCallId: string,
    toolName: string,
    signal: AbortSignal | undefined,
    phase?: "prepare",
  ): void;
  reserve(
    toolCallId: string,
    toolName: string,
    signal: AbortSignal | undefined,
  ): void;
  prepare(
    toolCallId: string,
    toolName: string,
    validatedArgs: unknown,
    parentToolCallId: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<void>;
  finish(
    toolCallId: string,
    toolName: string,
    args: unknown,
    signal: AbortSignal | undefined,
  ): void;
  discard(toolCallId: string, reason: "canceled" | "denied"): void;
  execute<T extends { isError: boolean }>(
    toolCallId: string,
    toolName: string,
    args: unknown,
    invoke: (admittedArgs: unknown) => Promise<T>,
    signal: AbortSignal | undefined,
  ): Promise<T>;
}

export interface ApprovalRequest {
  toolCallId: string;
  actionId: string;
  capability: Capability;
  /** Redacted. */
  target: string;
  /** Redacted, bounded. */
  argsSummary: string;
}

export interface PiSessionLike {
  agent: { state: { tools: readonly object[] } };
  reload?: unknown;
  _refreshToolRegistry?: unknown;
}

export interface ToolDispatchDeps {
  store: Store;
  policy: NativePolicy;
  caller: CallerContext;
  /** Run scope = permit.targetScopeId = event scope. */
  scopeId: string;
  workspaceId: string;
  runId: string;
  /** The running run record the permits are bound to. */
  runRecordId: string;
  ownership: WorkspaceOwnership;
  /** A live session-scoped fs.read grant already on the run and in CurrentPolicy.grantIds. */
  readGrantId: string;
  /** Adds a freshly minted once grant to the run and the host's live grant set. */
  attachGrant(grantId: string): void;
  /** Renderer approval round trip (the factory emits approval.requested); true = approved. */
  approve(request: ApprovalRequest, signal?: AbortSignal): Promise<boolean>;
  /** Sync live-secret redactor (CredentialResolver.redact). */
  redact(text: string): string;
  /** NativeControl.redact (Rust credential.redact lane). Rejection fails closed. */
  nativeRedact(
    text: string,
    signal?: AbortSignal,
  ): Promise<string | { text: string }>;
  /**
   * The native provider registration of the session being started (Codex's factory passes
   * the real, awaitable `registerNativeProvider`). Awaited before any tool is bound; a
   * rejection fails the start with SESSION_REGISTRATION_FAILED and nothing is bound.
   */
  registerNativeProvider(): Promise<void>;
  /** Pi's bindSplyceToolAdmission. */
  bindTool(tool: object, admission: ToolAdmission): () => void;
  argumentsArtifactId?(actionId: string, digest: string): string;
  context?: Pick<
    AgentContextToolsOptions,
    "index" | "codeTools" | "memory" | "scopeId"
  >;
  limits?: { timeoutMs: number; maxOutputBytes: number };
}

interface Call {
  name: string;
  actionId: string;
  permit: Readonly<ActionPermit>;
  argsSummary: string;
  reserved: boolean;
  admitted: boolean;
  consumed: boolean;
  effectSummary?: string;
}

const safeId = (value: string): string => value.replace(/[^\w.-]/gu, "_");
const hex = (digest: string): string => digest.replace(/^sha256:/u, "");
const hash32 = (text: string): number =>
  [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);

export interface ToolDispatch {
  tools: readonly DispatchTool[];
  /** Tool names for the Pi `tools` allowlist (customTools only; no built-ins). */
  allowlist: readonly string[];
  admission: ToolAdmission;
  /**
   * Awaits registerNativeProvider, then binds the admission to every tool of the session
   * and freezes its registry. No detached async: any failure rejects the returned promise.
   */
  bind(session: PiSessionLike): Promise<() => void>;
  /** Call once per turn end; memory capture runs only after a completed turn. */
  onTurnEnd(turn: { state: "completed" | "failed" | "canceled" }): number;
}

export function createToolDispatch(deps: ToolDispatchDeps): ToolDispatch {
  const { store, policy, caller } = deps;
  const calls = new Map<string, Call>();
  const byAction = new Map<string, Call>();

  // Permit-backed ports: NativePolicy owns the real grant check, the once-consume
  // and the (single) receipt; these only prove the tool runs for the admitted act.
  const grants: GrantPort = {
    check(req) {
      const call = byAction.get(req.actionId);
      const { permit } = call ?? {};
      if (
        !call ||
        !permit ||
        !call.admitted ||
        permit.capability !== req.capability ||
        permit.ownership.workspaceId !== req.workspaceId ||
        caller.sessionId !== req.sessionId ||
        hex(permit.argumentsDigest) !== hex(req.argumentsDigest)
      )
        return { ok: false, reason: "GRANT_REQUIRED" };
      return {
        ok: true,
        grantId: permit.grantId,
        scope: ONCE.has(req.capability) ? "once" : "session",
      };
    },
    consume(_grantId, intent: Act) {
      const call = byAction.get(intent.actionId);
      if (!call?.admitted || call.consumed) throw new Error("GRANT_CONSUMED");
      call.consumed = true;
    },
  };
  const receipts: ReceiptPort = {
    record(effect) {
      const summary = effect.summary;
      const call = byAction.get(effect.actionId);
      if (call) call.effectSummary = summary;
      return effect.actionId;
    },
  };
  const workspaces: WorkspacePort = {
    workspace(id) {
      const ws = store.getWorkspace(id);
      return ws
        ? {
            workspaceId: ws.workspaceId,
            canonicalPath: ws.canonicalPath,
            revision: hash32(ws.revision),
          }
        : undefined;
    },
  };

  const redactSync = (text: string): string => scrubSecrets(deps.redact(text));
  /** Sync scrub, then the Rust lane; a lane failure yields a placeholder, never raw text. */
  const redactFinal = async (
    text: string,
    signal?: AbortSignal,
  ): Promise<string> => {
    try {
      const out = await deps.nativeRedact(redactSync(text), signal);
      const redacted = typeof out === "string" ? out : out.text;
      return typeof redacted === "string" ? redacted : UNAVAILABLE;
    } catch {
      return UNAVAILABLE;
    }
  };

  const workspaceTools = createWorkspaceTools({
    workspaces,
    grants,
    receipts,
    sessionId: caller.sessionId,
    workspaceId: deps.workspaceId,
    ...(deps.limits ? { limits: deps.limits } : {}),
    redact: deps.redact,
  });
  const root = workspaces.workspace(deps.workspaceId)?.canonicalPath;
  const contextTools: readonly ContextTool[] =
    deps.context && root
      ? createAgentContextTools({
          ...deps.context,
          workspaceRoot: root,
          redact: redactSync,
        })
      : [];
  const impls = new Map<string, WorkspaceTool | ContextTool>([
    ...Object.entries(workspaceTools),
    ...contextTools.map((t): [string, ContextTool] => [t.name, t]),
  ]);
  const caps = new Map<string, Capability>(Object.entries(CAPABILITY));
  // Context tools are read-only: fs.read (session grant, never consumed).
  for (const tool of contextTools) caps.set(tool.name, "fs.read");

  const tools: DispatchTool[] = [...impls.values()].map((impl) => ({
    name: impl.name,
    description: impl.description,
    parameters: impl.parameters,
    async execute(toolCallId, args, signal) {
      const call = calls.get(toolCallId);
      // Defense in depth: Pi's bound tool.execute is a thrower; this refuses
      // anything that did not come through ToolAdmission.execute.
      if (!call?.admitted || call.name !== impl.name)
        throw new AdmissionError("POLICY_DENIED");
      try {
        const r = await impl.result(args, signal, call.actionId);
        return {
          content: [{ type: "text", text: r.text }],
          details: { summary: r.summary },
        };
      } catch (error) {
        if (
          error instanceof WorkspaceToolError ||
          error instanceof ContextToolError
        ) {
          const summary = (error as WorkspaceToolError).summary;
          return {
            content: [
              {
                type: "text",
                text: `${error.code}: ${redactSync(error.message)}`,
              },
            ],
            details: { code: error.code, ...(summary ? { summary } : {}) },
            isError: true,
          };
        }
        throw error;
      }
    },
  }));

  const draft = <K extends "turn.tool_intent" | "turn.tool_outcome">(
    kind: K,
    recordId: string,
    payload: Extract<SplyceEventDraft, { kind: K }>["payload"],
  ): SplyceEventDraft =>
    ({
      schemaVersion: CONTRACT_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      eventId: randomUUID(),
      recordId,
      createdAt: new Date().toISOString(),
      sourceIds: [recordId],
      sessionId: caller.sessionId,
      scopeId: deps.scopeId,
      durable: true,
      kind,
      payload,
    }) as SplyceEventDraft;

  type Executed = {
    result?: { details?: DispatchResult["details"] };
    isError: boolean;
    durationMs?: number;
  };

  const need = (toolCallId: string): Call => {
    const call = calls.get(toolCallId);
    if (!call) throw new AdmissionError("POLICY_DENIED");
    return call;
  };

  const admission: ToolAdmission = {
    check(toolCallId, toolName, signal, phase) {
      if (calls.has(toolCallId))
        policy.check(toolCallId, toolName, signal, phase);
    },
    reserve() {
      // The permit needs the validated arguments' digest; reservation happens in prepare.
    },
    async prepare(toolCallId, toolName, validatedArgs, parent, signal) {
      const capability = caps.get(toolName);
      if (parent !== undefined) throw new AdmissionError("INVALID_PARENT");
      if (!capability || !impls.has(toolName))
        throw new AdmissionError("CAPABILITY_REQUIRED");
      const digest = actionArgumentsDigest(validatedArgs);
      const actionId = safeId(toolCallId);
      const args = validatedArgs as Record<string, unknown>;
      const target =
        typeof args.path === "string"
          ? args.path
          : typeof args.pattern === "string"
            ? args.pattern
            : toolName;
      const argsSummary = (
        await redactFinal(JSON.stringify(validatedArgs), signal)
      ).slice(0, ARGS_SUMMARY_MAX);
      let grantId = deps.readGrantId;
      if (ONCE.has(capability)) {
        // Once capability: nothing is minted without an explicit approval. An
        // unapproved call authorizes against a grant id that is not live, so the
        // policy denies it with a durable receipt before anything runs.
        grantId = "grant-unapproved";
        const approved = await deps
          .approve(
            {
              toolCallId,
              actionId,
              capability,
              target: await redactFinal(target, signal),
              argsSummary,
            },
            signal,
          )
          .catch(() => false);
        if (approved && !signal?.aborted) {
          const minted = store.mintGrant(
            {
              workspaceId: deps.workspaceId,
              sessionId: caller.sessionId,
              capability,
              scope: "once",
              actionId,
              argumentsDigest: digest,
            },
            caller,
          );
          deps.attachGrant(minted.grantId);
          grantId = minted.grantId;
        }
      }
      const permit: ActionPermit = {
        toolCallId,
        toolName,
        actionId,
        runRecordId: deps.runRecordId,
        grantId,
        parentActionId: null,
        capabilityId: `workspace.${toolName}`,
        capabilityVersion: "1",
        argumentsArtifactId:
          deps.argumentsArtifactId?.(actionId, digest) ?? `args-${actionId}`,
        argumentsDigest: digest,
        targetScopeId: deps.scopeId,
        idempotencyKey: `${deps.runId}:${toolCallId}`,
        ownership: deps.ownership,
        capability,
      };
      policy.authorize(permit);
      calls.set(toolCallId, {
        name: toolName,
        actionId,
        permit,
        argsSummary,
        reserved: false,
        admitted: false,
        consumed: false,
      });
      byAction.set(actionId, calls.get(toolCallId)!);
      policy.reserve(toolCallId, toolName, signal);
      need(toolCallId).reserved = true;
      await policy.prepare(
        toolCallId,
        toolName,
        validatedArgs,
        undefined,
        signal,
      );
    },
    finish(toolCallId, toolName, args, signal) {
      need(toolCallId);
      policy.finish(toolCallId, toolName, args, signal);
    },
    discard(toolCallId, reason) {
      const call = calls.get(toolCallId);
      if (call?.reserved) policy.discard(toolCallId, reason);
      if (call) byAction.delete(call.actionId);
      calls.delete(toolCallId);
    },
    async execute<T extends { isError: boolean }>(
      toolCallId: string,
      toolName: string,
      args: unknown,
      invoke: (admittedArgs: unknown) => Promise<T>,
      signal: AbortSignal | undefined,
    ): Promise<T> {
      const call = need(toolCallId);
      const events: ExecuteEvents<T> = {
        intent: (running) =>
          draft("turn.tool_intent", running.recordId, {
            runId: deps.runId,
            actionId: call.actionId,
            capabilityId: call.permit.capabilityId,
            // `target` is a resolvable reference; the readable target is in argsSummary.
            target: deps.workspaceId,
            argsSummary: call.argsSummary,
          }),
        outcome: async ({ action, uncertain, result }) => {
          const executed = result as unknown as Executed | undefined;
          const status: "success" | "error" | "uncertain" =
            executed === undefined
              ? "uncertain"
              : executed.isError || uncertain
                ? "error"
                : "success";
          const details = executed?.result?.details;
          const raw = details?.summary;
          const preview = (await redactFinal(raw?.preview ?? "", signal)).slice(
            0,
            PREVIEW_MAX,
          );
          const summary: {
            exitCode?: number | null;
            durationMs?: number;
            bytes?: number;
            truncated?: boolean;
            preview?: string;
          } = {
            durationMs: raw?.durationMs ?? executed?.durationMs ?? 0,
            bytes: raw?.bytes ?? 0,
            truncated: raw?.truncated ?? false,
            preview,
          };
          if (raw?.exitCode !== undefined) summary.exitCode = raw.exitCode;
          return draft("turn.tool_outcome", action.recordId, {
            runId: deps.runId,
            actionId: call.actionId,
            status,
            ...(details?.code ? { error: details.code } : {}),
            summary,
          });
        },
      };
      try {
        return await policy.execute(
          toolCallId,
          toolName,
          args,
          (admittedArgs) => {
            call.admitted = true;
            return invoke(admittedArgs);
          },
          signal,
          events,
        );
      } finally {
        call.admitted = false;
        byAction.delete(call.actionId);
        calls.delete(toolCallId);
      }
    },
  };

  const memory = deps.context?.memory;
  const memoryScope = deps.context?.scopeId;
  return {
    tools,
    allowlist: tools.map((t) => t.name),
    admission,
    async bind(session) {
      try {
        await deps.registerNativeProvider();
      } catch {
        throw new ToolDispatchError("SESSION_REGISTRATION_FAILED");
      }
      const names = new Set(tools.map((t) => t.name));
      const live = session.agent.state.tools;
      for (const tool of live)
        if (!names.has((tool as { name?: string }).name ?? ""))
          throw new ToolDispatchError("TOOL_REGISTRY_FOREIGN");
      const unbind = live.map((tool) => deps.bindTool(tool, admission));
      const frozen = () => {
        throw new ToolDispatchError("TOOL_REGISTRY_FROZEN");
      };
      // Pi rebuilds (and so unbinds) every tool object on reload / registry refresh.
      for (const key of ["reload", "_refreshToolRegistry"] as const)
        Object.defineProperty(session, key, {
          value: frozen,
          configurable: false,
          writable: false,
        });
      return () => {
        for (const u of unbind) u();
      };
    },
    onTurnEnd(turn) {
      if (turn.state !== "completed" || !memory || !memoryScope) return 0;
      try {
        return captureMemoryAfterTurn(memory, memoryScope, caller.sessionId);
      } catch {
        // a capture failure never fails the turn
        return 0;
      }
    },
  };
}
