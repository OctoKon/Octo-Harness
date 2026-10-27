

// Cross-package handles are intentionally untyped here; callers pass real
// any/any instances from @splyce/index and @splyce/any.

export interface AgentContextTool {
  readonly name: string;
  readonly description: string;
  readonly readOnly: true;
  readonly parameters: Record<string, unknown>;
  execute(args: unknown): Promise<unknown>;
}

export interface AgentContextToolsOptions {
  readonly index?: any;
  readonly memory?: any;
  readonly scopeId: string;
  readonly sessionId?: string;
  readonly limit?: number;
}

function anySearchTool(
  any: any,
  scopeId: string,
  limit: number,
): AgentContextTool {
  return {
    name: "any_search",
    description:
      "Search captured cross-session any for this scope (read-only). Returns cited observations.",
    readOnly: true,
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1, maxLength: 512 },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
    },
    async execute(args: unknown) {
      const a = (args ?? {}) as Record<string, unknown>;
      const query = String(a.query ?? "");
      const n = Math.min(20, Math.max(1, Number(a.limit ?? limit)));
      const hits = await any.query(scopeId, query, n);
      return {
        results: hits.map((hit: any) => ({
          id: hit.id,
          text: String(hit.text).slice(0, 4000),
          sourceIds: hit.sourceIds,
        })),
      };
    },
  };
}

export function agentContextTools(
  ...args: unknown[]
): readonly AgentContextTool[] {
  let index: any | undefined;
  let memory: any;
  let scopeId = "";
  let limit = 5;
  if (args.length === 1 && args[0] && typeof args[0] === "object") {
    const opts = args[0] as AgentContextToolsOptions;
    index = opts.index;
    memory = opts.memory;
    scopeId = opts.scopeId;
    limit = opts.limit ?? limit;
  } else {
    index = args[0] as any | undefined;
    memory = args[1] as any | undefined;
    scopeId = String(args[2] ?? "");
    limit = Number(args[3] ?? limit);
  }
  const tools: AgentContextTool[] = [];
  if (index) {
    const { createRequire } = (globalThis as any).process.getBuiltinModule("node:module");
    const req = createRequire(import.meta.url);
    const mod: any = req("../../splyce-index/dist/index.js");
    tools.push(...(mod.codeIndexTools(index) as AgentContextTool[]));
  }
  if (memory && scopeId) {
    // inline memory tool
    tools.push({
      name: "memory_search",
      description: "Search captured cross-session memory for this scope (read-only). Returns cited observations.",
      readOnly: true,
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 512 },
          limit: { type: "integer", minimum: 1, maximum: 20 },
        },
      },
      async execute(args: unknown) {
        const a = (args ?? {}) as Record<string, unknown>;
        const query = String(a.query ?? "");
        const n = Math.min(20, Math.max(1, Number(a.limit ?? limit)));
        const hits = await memory.query(scopeId, query, n);
        return {
          results: hits.map((hit: any) => ({
            id: hit.id,
            text: String(hit.text).slice(0, 4000),
            sourceIds: hit.sourceIds,
          })),
        };
      },
    });
  }
  return Object.freeze(tools);
}

export const createAgentContextTools = agentContextTools;
export const contextTools = agentContextTools;
export default agentContextTools;
