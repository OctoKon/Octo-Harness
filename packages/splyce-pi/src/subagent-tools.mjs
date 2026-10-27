// TD-70 child tool composition: Pi's own built-in tools, rooted at the child
// root (parent workspace for read children, the worktree for write children).
// Pi grep/find are left out: they may fetch rg/fd on first use (no implicit
// installs); search goes through code_* instead. Unwired until the native
// host has an engine generation; E1_readonly_subagents exercises it.
import {
  createBashTool,
  createEditTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";

// Everything else (keys, tokens, provider config) stays out of child shells.
const SHELL_ENV_KEYS = new Set([
  "path",
  "pathext",
  "systemroot",
  "systemdrive",
  "windir",
  "comspec",
  "temp",
  "tmp",
  "home",
  "userprofile",
  "lang",
  "lc_all",
  "term",
]);

/** @param {Record<string, string | undefined>} env */
export function scrubShellEnv(env) {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) =>
      SHELL_ENV_KEYS.has(key.toLowerCase()),
    ),
  );
}

/**
 * Adapts a `{ name, description, parameters, execute(args) }` tool (code index,
 * memory) to a Pi AgentTool; `details` keeps the structured result for citations.
 */
export function agentToolFrom(tool) {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    async execute(_toolCallId, params) {
      const value = await tool.execute(params);
      return {
        content: [{ type: "text", text: JSON.stringify(value) }],
        details: value,
      };
    },
  };
}

/**
 * Capability → tool factory map for SubagentHost.tools. `codeTools` /
 * `memoryTools` are factories returning the plain tools for one child.
 */
export function childToolFactories({ codeTools, memoryTools } = {}) {
  return {
    "fs.read": (root) => [createReadTool(root), createLsTool(root)],
    "fs.write": (root) => [createWriteTool(root), createEditTool(root)],
    "shell.run": (root) => [
      createBashTool(root, {
        exposeSessionEnvironment: false,
        spawnHook: (context) => ({
          ...context,
          cwd: root,
          env: scrubShellEnv(context.env),
        }),
      }),
    ],
    ...(codeTools
      ? { "code.index": () => codeTools().map(agentToolFrom) }
      : {}),
    ...(memoryTools
      ? { "memory.query": () => memoryTools().map(agentToolFrom) }
      : {}),
  };
}
