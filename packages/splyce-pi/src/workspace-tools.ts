// Admission-wrapped coding tools (read, ls, find, grep, edit, write, bash,
// powershell) for the agent loop. Every path is confined to the admitted
// workspace root; fs.write and shell.run need a one-time grant bound to the
// exact target, consumed before the effect, with one receipt per effect.
// Pi's own tool implementations are not imported: they need the built
// coding-agent package and @types/node, which this package's tsconfig excludes.

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export type Capability = "fs.read" | "fs.write" | "shell.run";
export type GrantDenial = "GRANT_REQUIRED" | "GRANT_CONSUMED" | "GRANT_REVOKED";

export interface WorkspacePort {
  workspace(
    workspaceId: string,
  ):
    | { workspaceId: string; canonicalPath: string; revision: number }
    | undefined;
}
export interface Act {
  /** The tool call id; a once-grant is bound to it together with the digest. */
  actionId: string;
  /** sha256 hex of the canonical JSON of the call arguments. */
  argumentsDigest: string;
}
export interface Intent extends Act {
  capability: Capability;
  workspaceId: string;
  sessionId: string;
  target: string;
  summary: string;
}
export interface GrantPort {
  check(
    req: {
      workspaceId: string;
      sessionId: string;
      capability: Capability;
      target: string;
    } & Act,
  ):
    | { ok: true; grantId: string; scope: "session" | "once" }
    | { ok: false; reason: GrantDenial };
  /** Atomic; must throw if the grant is already consumed or revoked. */
  consume(grantId: string, intent: Intent): void;
}
export interface ReceiptPort {
  record(effect: Intent & { ok: boolean }): string;
}

export type ErrorCode =
  | GrantDenial
  | "WORKSPACE_ESCAPE"
  | "WORKSPACE_UNKNOWN"
  | "STALE_REVISION"
  | "SHELL_TIMEOUT"
  | "EDIT_NOT_FOUND"
  | "EDIT_AMBIGUOUS"
  | "BAD_ARGS"
  | "PATTERN_REJECTED"
  | "GREP_BUDGET"
  | "ABORTED"
  | "IO_ERROR";

export class WorkspaceToolError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceToolError";
    this.code = code;
  }
}

export interface WorkspaceTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    args: Record<string, unknown>,
    signal?: AbortSignal,
    actionId?: string,
  ): Promise<string>;
}

export interface WorkspaceToolsOptions {
  workspaces: WorkspacePort;
  grants: GrantPort;
  receipts: ReceiptPort;
  sessionId: string;
  workspaceId: string;
  limits?: { timeoutMs: number; maxOutputBytes: number };
}

const ENV_ALLOW = new Set(
  "PATH PATHEXT SYSTEMROOT WINDIR COMSPEC TEMP TMP TMPDIR HOME LANG TERM OS PROCESSOR_ARCHITECTURE NUMBER_OF_PROCESSORS".split(
    " ",
  ),
);
const SECRET = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|_API_/i;
const win = process.platform === "win32";
const DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const MAX_READ_BYTES = 8 << 20;
const MAX_WALK_FILE_BYTES = 1 << 20;
const MAX_PATTERN = 256;
const MAX_GREP_SCAN_BYTES = 8 << 20;
// shortcut: lines are matched on their first 4096 chars to bound backtracking input.
const MAX_GREP_LINE = 4096;
// shortcut: flat check only; overlapping alternation like (a|aa)+ is not caught, the scan budget bounds it.
const NESTED_QUANTIFIER = /\([^()]*(?:[+*]|\{\d+,\})[^()]*\)(?:[+*]|\{\d+,\})/;

const fail = (code: ErrorCode, message: string): never => {
  throw new WorkspaceToolError(code, message);
};
const escape = (): never =>
  fail("WORKSPACE_ESCAPE", "path escapes the workspace");

function scrubbedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && ENV_ALLOW.has(k.toUpperCase()) && !SECRET.test(k))
      env[k] = v;
  return env;
}

const encoder = new TextEncoder();
function cap(
  text: string,
  maxBytes: number,
): { text: string; truncated: boolean } {
  const bytes = encoder.encode(text);
  if (bytes.length <= maxBytes) return { text, truncated: false };
  return {
    text: new TextDecoder().decode(bytes.slice(0, maxBytes)),
    truncated: true,
  };
}

function globToRegExp(glob: string): RegExp {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
  return new RegExp(`^${re}$`);
}

const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v)
          .sort()
          .map(
            (k) =>
              `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`,
          )
          .join(",")}}`
      : (JSON.stringify(v) ?? "null");
const act = (args: unknown, actionId?: string): Act => ({
  actionId: actionId ?? randomUUID(),
  argumentsDigest: createHash("sha256").update(canonical(args)).digest("hex"),
});

const str = (v: unknown, name: string): string =>
  typeof v === "string" ? v : fail("BAD_ARGS", `${name} must be a string`);
const optStr = (v: unknown, name: string): string | undefined =>
  v === undefined ? undefined : str(v, name);
const optNum = (v: unknown, def: number): number =>
  typeof v === "number" && v > 0 ? Math.floor(v) : def;

const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const S = (description: string) => ({ type: "string", description });
const N = (description: string) => ({ type: "number", description });

export function createWorkspaceTools(
  opts: WorkspaceToolsOptions,
): Record<string, WorkspaceTool> {
  const { workspaces, grants, receipts, sessionId, workspaceId } = opts;
  const timeoutMs = opts.limits?.timeoutMs ?? 120_000;
  const maxBytes = opts.limits?.maxOutputBytes ?? 50 * 1024;
  const first =
    workspaces.workspace(workspaceId) ??
    fail("WORKSPACE_UNKNOWN", "workspace is not admitted");
  const revision = first.revision;

  const root = (): string => {
    const ws =
      workspaces.workspace(workspaceId) ??
      fail("WORKSPACE_UNKNOWN", "workspace is not admitted");
    if (ws.revision !== revision)
      fail("STALE_REVISION", "workspace revision changed");
    return ws.canonicalPath;
  };

  // Resolves the deepest existing ancestor through realpath so links and 8.3/case
  // variants are judged by where they really point, even when the leaf is new.
  async function confine(input: string): Promise<{ abs: string; rel: string }> {
    const base = root();
    if (input.includes("\0")) escape();
    if (win) {
      const segs = input.split(/[\\/]/);
      if (
        /^[\\/]{2}/.test(input) ||
        /^[a-zA-Z]:(?![\\/])/.test(input) ||
        input.replace(/^[a-zA-Z]:/, "").includes(":") ||
        segs.some(
          (s) => DEVICE.test(s) || (/[. ]$/.test(s) && s !== "." && s !== ".."),
        )
      )
        escape();
    }
    let cur = resolve(base, input);
    const tail: string[] = [];
    let real: string;
    for (;;) {
      try {
        real = await realpath(cur);
        break;
      } catch (e) {
        if ((e as { code?: string }).code !== "ENOENT")
          return fail("IO_ERROR", ioMessage(e, input));
        if (
          await lstat(cur).then(
            () => true,
            () => false,
          )
        )
          escape();
        const parent = dirname(cur);
        if (parent === cur) escape();
        tail.unshift(basename(cur));
        cur = parent;
      }
    }
    const abs = join(real, ...tail);
    const rel = relative(base, abs);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) escape();
    return { abs, rel: rel.split(sep).join("/") };
  }

  // The path may have been swapped for a link since the grant check: re-resolve
  // immediately before the fs operation.
  const recheck = async (input: string, abs: string, signal?: AbortSignal) => {
    if (signal?.aborted) fail("ABORTED", "aborted");
    if ((await confine(input)).abs !== abs) escape();
  };

  const ioMessage = (e: unknown, where: string) =>
    `${(e as { code?: string }).code ?? "error"}: ${where}`;
  const io = async <T>(where: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof WorkspaceToolError) throw e;
      return fail("IO_ERROR", ioMessage(e, where));
    }
  };

  const req = (capability: Capability, target: string, a: Act) => ({
    workspaceId,
    sessionId,
    capability,
    target,
    ...a,
  });
  function gate(capability: Capability, target: string, a: Act): string {
    const r = grants.check(req(capability, target, a));
    if (!r.ok) return fail(r.reason, `${capability} denied for ${target}`);
    if (capability !== "fs.read" && r.scope !== "once")
      return fail("GRANT_REQUIRED", `${capability} needs a one-time grant`);
    return r.grantId;
  }

  async function effect(
    capability: Capability,
    target: string,
    grantId: string,
    a: Act,
    fn: () => Promise<{ summary: string; ok: boolean; text: string }>,
  ): Promise<string> {
    const intent = { ...req(capability, target, a), summary: "" };
    try {
      grants.consume(grantId, intent);
    } catch {
      const r = grants.check(req(capability, target, a));
      return fail(
        r.ok ? "GRANT_CONSUMED" : r.reason,
        `${capability} grant unusable for ${target}`,
      );
    }
    try {
      const out = await fn();
      receipts.record({ ...intent, summary: out.summary, ok: out.ok });
      return out.text;
    } catch (e) {
      receipts.record({
        ...intent,
        summary: e instanceof WorkspaceToolError ? e.code : "failed",
        ok: false,
      });
      throw e;
    }
  }

  async function* walk(
    dir: string,
    relDir: string,
  ): AsyncGenerator<{ abs: string; rel: string; file: boolean }> {
    for (const d of await readdir(dir, { withFileTypes: true })) {
      if (d.isSymbolicLink() || d.name === ".git") continue;
      const abs = join(dir, d.name);
      const rel = relDir ? `${relDir}/${d.name}` : d.name;
      if (d.isDirectory()) {
        yield { abs, rel, file: false };
        yield* walk(abs, rel);
      } else if (d.isFile()) yield { abs, rel, file: true };
    }
  }

  const lines = (text: string, limit: number, more: string) => {
    const c = cap(text, maxBytes);
    return c.truncated
      ? `${c.text}\n[output truncated]`
      : more
        ? `${c.text}\n${more}`
        : c.text;
  };

  async function exec(
    kind: "bash" | "powershell",
    command: string,
    ms: number,
    signal?: AbortSignal,
  ) {
    const [file, args] =
      kind === "bash"
        ? ["bash", ["-c", command]]
        : [
            win ? "powershell.exe" : "pwsh",
            ["-NoProfile", "-NonInteractive", "-Command", command],
          ];
    const child = spawn(file as string, args as string[], {
      cwd: root(),
      env: scrubbedEnv(),
      windowsHide: true,
      detached: !win,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const killTree = () => {
      if (child.pid === undefined) return;
      if (win)
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: ["ignore", "ignore", "ignore"],
        });
      else
        try {
          (process as unknown as { kill(pid: number, sig: string): void }).kill(
            -child.pid,
            "SIGKILL",
          );
        } catch {
          child.kill("SIGKILL");
        }
    };
    let out = "";
    let used = 0;
    let truncated = false;
    const onData = (c: { length: number; toString(): string }) => {
      if (truncated) return;
      if (used + c.length > maxBytes) {
        out += cap(c.toString(), maxBytes - used).text;
        truncated = true;
      } else out += c.toString();
      used += c.length;
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    return new Promise<{ code: number; text: string }>((done, reject) => {
      let settled = false;
      const settle = (f: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        f();
      };
      const timer = setTimeout(() => {
        killTree();
        settle(() =>
          reject(
            new WorkspaceToolError(
              "SHELL_TIMEOUT",
              `command exceeded ${String(ms)}ms and was killed`,
            ),
          ),
        );
      }, ms);
      const onAbort = () => {
        killTree();
        settle(() =>
          reject(new WorkspaceToolError("ABORTED", "command aborted")),
        );
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      child.on("error", (e) =>
        settle(() =>
          reject(
            new WorkspaceToolError(
              "IO_ERROR",
              `cannot start ${kind}: ${(e as { code?: string }).code ?? "error"}`,
            ),
          ),
        ),
      );
      child.on("close", (code) =>
        settle(() =>
          done({
            code: code ?? 1,
            text: truncated ? `${out}\n[output truncated]` : out,
          }),
        ),
      );
    });
  }

  const shell = (
    kind: "bash" | "powershell",
    label: string,
  ): WorkspaceTool => ({
    name: kind,
    description: `Run a ${label} command in the workspace root. Needs a one-time approval for this exact command; output is capped and the command is killed on timeout.`,
    parameters: obj(
      {
        command: S("Command to execute"),
        timeout: N("Timeout in seconds (capped by policy)"),
      },
      ["command"],
    ),
    async execute(args, signal, actionId) {
      if (signal?.aborted) fail("ABORTED", "aborted");
      const a = act(args, actionId);
      const command = str(args.command, "command");
      root();
      const ms = Math.min(timeoutMs, optNum(args.timeout, Infinity) * 1000);
      const target = `${kind}:${command}`;
      const grantId = gate("shell.run", target, a);
      return effect("shell.run", target, grantId, a, async () => {
        const r = await exec(kind, command, ms, signal);
        return {
          summary: `exit ${String(r.code)}`,
          ok: r.code === 0,
          text:
            r.code === 0 ? r.text : `${r.text}\n[exit code ${String(r.code)}]`,
        };
      });
    },
  });

  const tools: WorkspaceTool[] = [
    {
      name: "read",
      description:
        "Read a text file inside the workspace. Use offset/limit (1-indexed lines) for large files.",
      parameters: obj(
        {
          path: S("File path, relative to the workspace root"),
          offset: N("First line, 1-indexed"),
          limit: N("Maximum lines"),
        },
        ["path"],
      ),
      async execute(args, _signal, actionId) {
        const a = act(args, actionId);
        const { abs, rel } = await confine(str(args.path, "path"));
        gate("fs.read", rel, a);
        const text = await io(rel, async () => {
          if ((await lstat(abs)).size > MAX_READ_BYTES)
            fail("IO_ERROR", `too large: ${rel}`);
          return readFile(abs, "utf8");
        });
        const all = text.split("\n");
        const start = optNum(args.offset, 1) - 1;
        const end = start + optNum(args.limit, 2000);
        return lines(
          all.slice(start, end).join("\n"),
          0,
          end < all.length
            ? `[${String(all.length - end)} more lines; continue with offset ${String(end + 1)}]`
            : "",
        );
      },
    },
    {
      name: "ls",
      description:
        "List a directory inside the workspace (directories end with /).",
      parameters: obj(
        {
          path: S("Directory, default workspace root"),
          limit: N("Maximum entries"),
        },
        [],
      ),
      async execute(args, _signal, actionId) {
        const a = act(args, actionId);
        const { abs, rel } = await confine(optStr(args.path, "path") ?? ".");
        gate("fs.read", rel, a);
        const names = (
          await io(rel, () => readdir(abs, { withFileTypes: true }))
        )
          .map((d) => (d.isDirectory() ? `${d.name}/` : d.name))
          .sort();
        return lines(names.slice(0, optNum(args.limit, 500)).join("\n"), 0, "");
      },
    },
    {
      name: "find",
      description:
        "Find files by glob (e.g. '**/*.ts') inside the workspace. Symbolic links are not followed.",
      parameters: obj(
        {
          pattern: S("Glob pattern"),
          path: S("Directory, default workspace root"),
          limit: N("Maximum results"),
        },
        ["pattern"],
      ),
      async execute(args, _signal, actionId) {
        const a = act(args, actionId);
        const glob = str(args.pattern, "pattern");
        const re = globToRegExp(glob);
        const { abs, rel } = await confine(optStr(args.path, "path") ?? ".");
        gate("fs.read", rel, a);
        const limit = optNum(args.limit, 1000);
        const hits: string[] = [];
        await io(rel, async () => {
          for await (const e of walk(abs, rel === "" ? "" : rel)) {
            if (re.test(glob.includes("/") ? e.rel : basename(e.rel)))
              hits.push(e.rel);
            if (hits.length >= limit) break;
          }
        });
        return lines(hits.join("\n"), 0, "");
      },
    },
    {
      name: "grep",
      description:
        "Search file contents inside the workspace; prints path:line:text. Symbolic links are not followed.",
      parameters: obj(
        {
          pattern: S("Regex or literal text"),
          path: S("Directory or file, default workspace root"),
          glob: S("Filter files, e.g. '*.ts'"),
          ignoreCase: { type: "boolean" },
          literal: { type: "boolean" },
          limit: N("Maximum matches"),
        },
        ["pattern"],
      ),
      async execute(args, _signal, actionId) {
        const a = act(args, actionId);
        const pat = str(args.pattern, "pattern");
        if (
          pat.length > MAX_PATTERN ||
          (args.literal !== true &&
            NESTED_QUANTIFIER.test(pat.replace(/\\./g, "x")))
        )
          fail(
            "PATTERN_REJECTED",
            "pattern too long or has nested unbounded quantifiers",
          );
        let re: RegExp;
        try {
          re = new RegExp(
            args.literal === true
              ? pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
              : pat,
            args.ignoreCase === true ? "i" : "",
          );
        } catch {
          return fail("BAD_ARGS", "invalid pattern");
        }
        const g = optStr(args.glob, "glob");
        const gre = g ? globToRegExp(g) : undefined;
        const { abs, rel } = await confine(optStr(args.path, "path") ?? ".");
        gate("fs.read", rel, a);
        const limit = optNum(args.limit, 100);
        const hits: string[] = [];
        await io(rel, async () => {
          const st = await lstat(abs);
          const files = st.isFile()
            ? [{ abs, rel, file: true }]
            : walk(abs, rel);
          const started = Date.now();
          let scanned = 0;
          for await (const e of files) {
            if (
              !e.file ||
              (gre && !gre.test(g?.includes("/") ? e.rel : basename(e.rel)))
            )
              continue;
            const size = (await lstat(e.abs)).size;
            if (size > MAX_WALK_FILE_BYTES) continue;
            scanned += size;
            if (scanned > MAX_GREP_SCAN_BYTES)
              fail("GREP_BUDGET", "search exceeded its scan budget");
            const ls = (await readFile(e.abs, "utf8")).split("\n");
            for (let i = 0; i < ls.length && hits.length < limit; i++) {
              if (Date.now() - started > timeoutMs)
                fail("GREP_BUDGET", "search exceeded its time budget");
              if (re.test((ls[i] as string).slice(0, MAX_GREP_LINE)))
                hits.push(`${e.rel}:${String(i + 1)}:${ls[i] as string}`);
            }
            if (hits.length >= limit) break;
          }
        });
        return lines(hits.join("\n"), 0, "");
      },
    },
    {
      name: "write",
      description:
        "Create or overwrite a file inside the workspace. Needs a one-time approval for this exact path.",
      parameters: obj(
        {
          path: S("File path, relative to the workspace root"),
          content: S("Full file content"),
        },
        ["path", "content"],
      ),
      async execute(args, signal, actionId) {
        const a = act(args, actionId);
        const content = str(args.content, "content");
        const path = str(args.path, "path");
        const { abs, rel } = await confine(path);
        const grantId = gate("fs.write", rel, a);
        return effect("fs.write", rel, grantId, a, () =>
          io(rel, async () => {
            await mkdir(dirname(abs), { recursive: true });
            await recheck(path, abs, signal);
            await writeFile(abs, content);
            const n = encoder.encode(content).length;
            return {
              summary: `wrote ${String(n)} bytes`,
              ok: true,
              text: `Wrote ${String(n)} bytes to ${rel}`,
            };
          }),
        );
      },
    },
    {
      name: "edit",
      description:
        "Replace exact, unique text in a file inside the workspace. Needs a one-time approval for this exact path.",
      parameters: obj(
        {
          path: S("File path, relative to the workspace root"),
          edits: {
            type: "array",
            items: obj(
              {
                oldText: S("Exact text to replace; must match once"),
                newText: S("Replacement"),
              },
              ["oldText", "newText"],
            ),
          },
        },
        ["path", "edits"],
      ),
      async execute(args, signal, actionId) {
        const a = act(args, actionId);
        const list = Array.isArray(args.edits)
          ? (args.edits as Record<string, unknown>[])
          : fail("BAD_ARGS", "edits must be an array");
        const path = str(args.path, "path");
        const { abs, rel } = await confine(path);
        const grantId = gate("fs.write", rel, a);
        let text = await io(rel, () => readFile(abs, "utf8"));
        for (const e of list) {
          const o = str(e.oldText, "oldText");
          const n = str(e.newText, "newText");
          const at = o === "" ? -1 : text.indexOf(o);
          if (at < 0) fail("EDIT_NOT_FOUND", `oldText not found in ${rel}`);
          if (text.indexOf(o, at + 1) >= 0)
            fail("EDIT_AMBIGUOUS", `oldText matches more than once in ${rel}`);
          text = text.slice(0, at) + n + text.slice(at + o.length);
        }
        return effect("fs.write", rel, grantId, a, () =>
          io(rel, async () => {
            await recheck(path, abs, signal);
            await writeFile(abs, text);
            return {
              summary: `edited ${String(list.length)} block(s)`,
              ok: true,
              text: `Edited ${rel}`,
            };
          }),
        );
      },
    },
    shell("bash", "bash"),
    shell("powershell", "PowerShell"),
  ];
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}
