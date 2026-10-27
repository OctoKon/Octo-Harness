// Agent workspace tools: every rule is a negative test against the real filesystem
// and real child processes; each must fail when its guard is removed.

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createWorkspaceTools,
  type Capability,
  type GrantPort,
  type ReceiptPort,
  type WorkspacePort,
} from "../../packages/splyce-pi/dist/workspace-tools.js";

const win = process.platform === "win32";
const base = mkdtempSync(join(tmpdir(), "splyce-wt-"));
test.after(() => rmSync(base, { recursive: true, force: true }));

interface Grant {
  id: string;
  cap: Capability;
  scope: "session" | "once";
  target?: string;
  consumed?: boolean;
  revoked?: boolean;
}

function harness(limits?: { timeoutMs?: number; maxOutputBytes?: number }) {
  const dir = mkdtempSync(join(base, "case-"));
  const root = join(dir, "root");
  const outside = join(dir, "outside");
  mkdirSync(root);
  mkdirSync(outside);
  const ws = {
    workspaceId: "w1",
    canonicalPath: realpathSync.native(root),
    revision: 1,
  };
  const workspaces: WorkspacePort = {
    workspace: (id) => (id === "w1" ? ws : undefined),
  };
  const all: Grant[] = [{ id: "g-read", cap: "fs.read", scope: "session" }];
  let n = 0;
  const grants: GrantPort & {
    approve(cap: Capability, target: string): string;
    all: Grant[];
  } = {
    all,
    approve(cap, target) {
      const id = `g${String((n += 1))}`;
      all.push({ id, cap, scope: "once", target });
      return id;
    },
    check(req) {
      const mine = all.filter(
        (g) =>
          g.cap === req.capability &&
          (g.scope === "session" || g.target === req.target),
      );
      const live = mine.find((g) => !g.consumed && !g.revoked);
      if (live) return { ok: true, grantId: live.id, scope: live.scope };
      if (mine.some((g) => g.revoked))
        return { ok: false, reason: "GRANT_REVOKED" };
      if (mine.some((g) => g.consumed))
        return { ok: false, reason: "GRANT_CONSUMED" };
      return { ok: false, reason: "GRANT_REQUIRED" };
    },
    consume(id) {
      const g = all.find((x) => x.id === id);
      if (!g || g.consumed || g.revoked) throw new Error("grant unusable");
      g.consumed = true;
    },
  };
  const log: Parameters<ReceiptPort["record"]>[0][] = [];
  const receipts: ReceiptPort = {
    record(effect) {
      log.push(effect);
      return `r${String(log.length)}`;
    },
  };
  const tools = createWorkspaceTools({
    workspaces,
    grants,
    receipts,
    sessionId: "s1",
    workspaceId: "w1",
    ...(limits
      ? { limits: { timeoutMs: 20000, maxOutputBytes: 1 << 20, ...limits } }
      : {}),
  });
  return { root, outside, ws, grants, log, tools };
}
type H = ReturnType<typeof harness>;
const run = (h: H, name: string, args: object) =>
  (
    h.tools[name] as { execute(a: object, s?: AbortSignal): Promise<unknown> }
  ).execute(args);
const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? `no-code:${String(e)}`;
  }
  return "NO_ERROR";
};
const link = (h: H, name: string, target: string, kind: "dir" | "file") => {
  try {
    symlinkSync(
      target,
      join(h.root, name),
      kind === "dir" ? "junction" : "file",
    );
    return true;
  } catch {
    return false;
  }
};

test("read inside the workspace is allowed, including a case-variant root", async () => {
  const h = harness();
  writeFileSync(join(h.root, "a.txt"), "one\ntwo\nthree");
  assert.match(String(await run(h, "read", { path: "a.txt" })), /two/);
  assert.match(
    String(await run(h, "read", { path: "a.txt", offset: 2, limit: 1 })),
    /^two/,
  );
  if (win) {
    const upper = join(h.ws.canonicalPath.toUpperCase(), "a.txt");
    assert.match(String(await run(h, "read", { path: upper })), /one/);
  }
});

test("read outside the root is denied without leaking the root", async () => {
  const h = harness();
  writeFileSync(join(h.outside, "s.txt"), "secret");
  const bad = ["..", "../x", "..\\x", h.outside, join(h.outside, "s.txt")];
  if (win)
    bad.push(
      "\\\\server\\share\\x",
      "\\\\.\\C:\\Windows\\win.ini",
      "\\\\?\\C:\\Windows\\win.ini",
      "C:win.ini",
      "CON",
      "a.txt:stream",
      ".. \\x",
    );
  for (const path of bad) {
    const p = run(h, "read", { path });
    const err = await p.then(
      () => undefined,
      (e: { code?: string; message: string }) => e,
    );
    assert.equal(err?.code, "WORKSPACE_ESCAPE", path);
    assert.ok(
      !err.message.toLowerCase().includes(h.ws.canonicalPath.toLowerCase()),
      path,
    );
  }
});

test("symlink and junction escapes are denied for read, ls and write", async (t) => {
  const h = harness();
  writeFileSync(join(h.outside, "s.txt"), "secret");
  assert.ok(link(h, "jn", h.outside, "dir"), "junction creation must work");
  assert.equal(
    await codeOf(run(h, "read", { path: "jn/s.txt" })),
    "WORKSPACE_ESCAPE",
  );
  assert.equal(await codeOf(run(h, "ls", { path: "jn" })), "WORKSPACE_ESCAPE");
  h.grants.approve("fs.write", "jn/new.txt");
  assert.equal(
    await codeOf(run(h, "write", { path: "jn/new.txt", content: "x" })),
    "WORKSPACE_ESCAPE",
  );
  assert.equal(existsSync(join(h.outside, "new.txt")), false);
  if (link(h, "fl", join(h.outside, "s.txt"), "file"))
    assert.equal(
      await codeOf(run(h, "read", { path: "fl" })),
      "WORKSPACE_ESCAPE",
    );
  else t.diagnostic("file symlink not creatable on this host; skipped");
  assert.ok(link(h, "dj", join(h.outside, "nodir"), "dir"));
  h.grants.approve("fs.write", "dj/new.txt");
  assert.equal(
    await codeOf(run(h, "write", { path: "dj/new.txt", content: "x" })),
    "WORKSPACE_ESCAPE",
  );
  assert.equal(existsSync(join(h.outside, "nodir")), false);
  if (link(h, "dangling", join(h.outside, "nope.txt"), "file")) {
    h.grants.approve("fs.write", "dangling");
    assert.equal(
      await codeOf(run(h, "write", { path: "dangling", content: "x" })),
      "WORKSPACE_ESCAPE",
    );
    assert.equal(existsSync(join(h.outside, "nope.txt")), false);
  }
});

test("write without a grant is denied and nothing is written or recorded", async () => {
  const h = harness();
  assert.equal(
    await codeOf(run(h, "write", { path: "w.txt", content: "x" })),
    "GRANT_REQUIRED",
  );
  assert.equal(existsSync(join(h.root, "w.txt")), false);
  assert.equal(h.log.length, 0);
});

test("a once-grant bound to X cannot write Y, and still writes X", async () => {
  const h = harness();
  h.grants.approve("fs.write", "x.txt");
  assert.equal(
    await codeOf(run(h, "write", { path: "y.txt", content: "y" })),
    "GRANT_REQUIRED",
  );
  assert.equal(existsSync(join(h.root, "y.txt")), false);
  assert.equal(h.log.length, 0);
  await run(h, "write", { path: "sub/../x.txt", content: "x" });
  assert.equal(readFileSync(join(h.root, "x.txt"), "utf8"), "x");
});

test("a consumed grant cannot be reused", async () => {
  const h = harness();
  h.grants.approve("fs.write", "x.txt");
  await run(h, "write", { path: "x.txt", content: "one" });
  assert.equal(
    await codeOf(run(h, "write", { path: "x.txt", content: "two" })),
    "GRANT_CONSUMED",
  );
  assert.equal(readFileSync(join(h.root, "x.txt"), "utf8"), "one");
});

test("a revoked grant is denied", async () => {
  const h = harness();
  const id = h.grants.approve("fs.write", "x.txt");
  h.grants.all.find((g) => g.id === id)!.revoked = true;
  assert.equal(
    await codeOf(run(h, "write", { path: "x.txt", content: "x" })),
    "GRANT_REVOKED",
  );
  assert.equal(existsSync(join(h.root, "x.txt")), false);
});

test("a grant consumed concurrently by another caller blocks the effect", async () => {
  const h = harness();
  h.grants.approve("fs.write", "x.txt");
  const consume = h.grants.consume.bind(h.grants);
  h.grants.consume = (id, r) => {
    consume(id, r);
    throw new Error("already consumed");
  };
  assert.equal(
    await codeOf(run(h, "write", { path: "x.txt", content: "x" })),
    "GRANT_CONSUMED",
  );
  assert.equal(existsSync(join(h.root, "x.txt")), false);
  assert.equal(h.log.length, 0);
});

test("edit obeys the same grant rules and applies a unique replacement", async () => {
  const h = harness();
  const file = join(h.root, "e.txt");
  writeFileSync(file, "alpha beta");
  const edits = [{ oldText: "beta", newText: "gamma" }];
  assert.equal(
    await codeOf(run(h, "edit", { path: "e.txt", edits })),
    "GRANT_REQUIRED",
  );
  assert.equal(readFileSync(file, "utf8"), "alpha beta");
  h.grants.approve("fs.write", "other.txt");
  assert.equal(
    await codeOf(run(h, "edit", { path: "e.txt", edits })),
    "GRANT_REQUIRED",
  );
  const id = h.grants.approve("fs.write", "e.txt");
  assert.equal(
    await codeOf(
      run(h, "edit", {
        path: "e.txt",
        edits: [{ oldText: "zzz", newText: "q" }],
      }),
    ),
    "EDIT_NOT_FOUND",
  );
  assert.equal(h.grants.all.find((g) => g.id === id)?.consumed, undefined);
  await run(h, "edit", { path: "e.txt", edits });
  assert.equal(readFileSync(file, "utf8"), "alpha gamma");
  assert.equal(
    await codeOf(
      run(h, "edit", {
        path: "e.txt",
        edits: [{ oldText: "alpha", newText: "a" }],
      }),
    ),
    "GRANT_CONSUMED",
  );
  const rid = h.grants.approve("fs.write", "e.txt");
  h.grants.all.find((g) => g.id === rid)!.revoked = true;
  assert.equal(
    await codeOf(run(h, "edit", { path: "e.txt", edits })),
    "GRANT_REVOKED",
  );
  assert.equal(
    await codeOf(run(h, "edit", { path: "../e.txt", edits })),
    "WORKSPACE_ESCAPE",
  );
  assert.equal(h.log.length, 1);
});

test("ls, find and grep never return or follow paths outside the root", async () => {
  const h = harness();
  writeFileSync(join(h.root, "in.txt"), "needle inside");
  mkdirSync(join(h.root, "d"));
  writeFileSync(join(h.root, "d", "deep.txt"), "needle deep");
  writeFileSync(join(h.outside, "s.txt"), "needle outside");
  assert.ok(link(h, "jn", h.outside, "dir"), "junction creation must work");
  const outputs = [
    String(await run(h, "ls", {})),
    String(await run(h, "find", { pattern: "**/*.txt" })),
    String(await run(h, "grep", { pattern: "needle" })),
  ];
  assert.match(outputs[1]!, /d\/deep\.txt/);
  assert.match(outputs[2]!, /in\.txt:1:needle inside/);
  for (const out of outputs) {
    assert.ok(!out.includes("outside"), out);
    assert.ok(!out.includes("s.txt"), out);
    assert.ok(
      !out.toLowerCase().includes(h.ws.canonicalPath.toLowerCase()),
      out,
    );
  }
  assert.equal(
    await codeOf(run(h, "grep", { pattern: "needle", path: "jn" })),
    "WORKSPACE_ESCAPE",
  );
  assert.equal(
    await codeOf(run(h, "find", { pattern: "*", path: ".." })),
    "WORKSPACE_ESCAPE",
  );
});

const sh = win ? "powershell" : "bash";
const pidCmd = win
  ? "$PID | Out-File pid.txt; Start-Sleep 60"
  : "echo $$ > pid.txt; sleep 60";

test("shell without a grant is denied and nothing runs", async () => {
  const h = harness();
  assert.equal(
    await codeOf(run(h, sh, { command: "echo hi > m.txt" })),
    "GRANT_REQUIRED",
  );
  assert.equal(existsSync(join(h.root, "m.txt")), false);
  assert.equal(h.log.length, 0);
});

test("shell with a grant for the exact command runs in the root; one char off is denied", async () => {
  const h = harness();
  const cmd = win ? "(Get-Location).Path" : "pwd";
  h.grants.approve("shell.run", `${sh}:${cmd}`);
  const out = String(await run(h, sh, { command: cmd }));
  assert.equal(out.trim().toLowerCase(), h.ws.canonicalPath.toLowerCase());
  h.grants.approve("shell.run", `${sh}:${"echo hi > m.txt"}`);
  assert.equal(
    await codeOf(run(h, sh, { command: "echo hi > m.txt " })),
    "GRANT_REQUIRED",
  );
  assert.equal(
    await codeOf(run(h, sh, { command: "echo hi > m.tx" })),
    "GRANT_REQUIRED",
  );
  assert.equal(existsSync(join(h.root, "m.txt")), false);
  assert.equal(h.log.length, 1);
});

test("shell timeout kills the process tree and reports SHELL_TIMEOUT", async () => {
  const h = harness({ timeoutMs: 12000 });
  h.grants.approve("shell.run", `${sh}:${pidCmd}`);
  const started = Date.now();
  assert.equal(await codeOf(run(h, sh, { command: pidCmd })), "SHELL_TIMEOUT");
  assert.ok(Date.now() - started < 30000);
  const pid = Number(
    readFileSync(join(h.root, "pid.txt"), "utf16le")
      .replace(/\0/g, "")
      .trim() || readFileSync(join(h.root, "pid.txt"), "utf8").trim(),
  );
  assert.ok(pid > 0);
  await new Promise((r) => setTimeout(r, 500));
  assert.throws(() => process.kill(pid, 0));
  assert.equal(h.log.length, 1);
  assert.equal(h.log[0]?.ok, false);
});

const nodeCmd = (js: string) => `node -e "${js}"`;

test("shell output is capped with a truncation marker", async () => {
  const h = harness({ maxOutputBytes: 100 });
  const cmd = nodeCmd("console.log('a'.repeat(5000))");
  h.grants.approve("shell.run", `${sh}:${cmd}`);
  const out = String(await run(h, sh, { command: cmd }));
  assert.match(out, /\[output truncated\]/);
  assert.ok(out.length < 300, String(out.length));
});

test("secret-looking env vars never reach the child", async () => {
  const h = harness();
  process.env.SPLYCE_TEST_API_KEY = "sekret";
  process.env.SPLYCE_TEST_DB_PASSWORD = "sekret";
  const cmd = nodeCmd(
    "console.log([process.env.SPLYCE_TEST_API_KEY, process.env.SPLYCE_TEST_DB_PASSWORD, typeof process.env.PATH].join(','))",
  );
  h.grants.approve("shell.run", `${sh}:${cmd}`);
  try {
    assert.equal(String(await run(h, sh, { command: cmd })).trim(), ",,string");
  } finally {
    delete process.env.SPLYCE_TEST_API_KEY;
    delete process.env.SPLYCE_TEST_DB_PASSWORD;
  }
});

test("exactly one receipt per effect and none on denial", async () => {
  const h = harness();
  h.grants.approve("fs.write", "a.txt");
  await run(h, "write", { path: "a.txt", content: "x" });
  await codeOf(run(h, "write", { path: "a.txt", content: "y" }));
  await codeOf(run(h, "read", { path: "../a.txt" }));
  await run(h, "read", { path: "a.txt" });
  assert.deepEqual(
    h.log.map((r) => [
      r.capability,
      r.workspaceId,
      r.sessionId,
      r.target,
      r.ok,
    ]),
    [["fs.write", "w1", "s1", "a.txt", true]],
  );
  const cmd = "echo hi";
  h.grants.approve("shell.run", `${sh}:${cmd}`);
  await run(h, sh, { command: cmd });
  assert.equal(h.log.length, 2);
  assert.equal(h.log[1]?.capability, "shell.run");
});

test("a changed workspace revision or an unknown workspace is refused", async () => {
  const h = harness();
  writeFileSync(join(h.root, "a.txt"), "x");
  h.ws.revision = 2;
  assert.equal(
    await codeOf(run(h, "read", { path: "a.txt" })),
    "STALE_REVISION",
  );
  const gone = harness();
  assert.throws(
    () =>
      createWorkspaceTools({
        workspaces: { workspace: () => undefined },
        grants: gone.grants,
        receipts: { record: () => "r" },
        sessionId: "s1",
        workspaceId: "nope",
      }),
    { code: "WORKSPACE_UNKNOWN" },
  );
});

test("grant checks and receipts carry the action id and a canonical argument digest; session write grants are refused", async () => {
  const h = harness();
  const seen: { actionId: string; argumentsDigest: string }[] = [];
  const check = h.grants.check.bind(h.grants);
  h.grants.check = (r) => (seen.push(r), check(r));
  h.grants.approve("fs.write", "a.txt");
  const exec = (
    h.tools.write as {
      execute(a: object, s?: AbortSignal, id?: string): Promise<unknown>;
    }
  ).execute;
  await exec({ path: "a.txt", content: "x" }, undefined, "call-1");
  await codeOf(exec({ path: "b.txt", content: "x" }, undefined, "call-2"));
  await codeOf(exec({ content: "x", path: "b.txt" }, undefined, "call-3"));
  assert.equal(h.log[0]?.actionId, "call-1");
  assert.match(h.log[0]!.argumentsDigest, /^[0-9a-f]{64}$/);
  const d = (id: string) =>
    seen.find((x) => x.actionId === id)?.argumentsDigest;
  assert.equal(d("call-2"), d("call-3"));
  assert.notEqual(d("call-1"), d("call-2"));
  h.grants.all.push({ id: "gs", cap: "fs.write", scope: "session" });
  assert.equal(
    await codeOf(run(h, "write", { path: "c.txt", content: "x" })),
    "GRANT_REQUIRED",
  );
  assert.equal(existsSync(join(h.root, "c.txt")), false);
});

test("a capped shell run writes no raw output spill file", async () => {
  const h = harness({ maxOutputBytes: 100 });
  const cmd = nodeCmd("console.log('SPILLMARK'.repeat(20000))");
  h.grants.approve("shell.run", `${sh}:${cmd}`);
  const started = Date.now() - 1000;
  await run(h, sh, { command: cmd });
  assert.deepEqual(readdirSync(h.root), []);
  for (const f of readdirSync(tmpdir())) {
    try {
      const p = join(tmpdir(), f);
      const st = statSync(p);
      if (st.isFile() && st.mtimeMs >= started && st.size > 4000)
        assert.ok(!readFileSync(p, "utf8").includes("SPILLMARK"), f);
    } catch (e) {
      if ((e as Error).name === "AssertionError") throw e;
    }
  }
});

test("a directory swapped for a link after the grant is consumed cannot redirect write or edit", async () => {
  for (const tool of ["write", "edit"]) {
    const h = harness();
    mkdirSync(join(h.root, "sub"));
    writeFileSync(join(h.root, "sub", "f.txt"), "old");
    h.grants.approve("fs.write", "sub/f.txt");
    const consume = h.grants.consume.bind(h.grants);
    h.grants.consume = (id, r) => {
      consume(id, r);
      rmSync(join(h.root, "sub"), { recursive: true });
      symlinkSync(h.outside, join(h.root, "sub"), "junction");
    };
    const args =
      tool === "write"
        ? { path: "sub/f.txt", content: "new" }
        : { path: "sub/f.txt", edits: [{ oldText: "old", newText: "new" }] };
    assert.equal(await codeOf(run(h, tool, args)), "WORKSPACE_ESCAPE", tool);
    assert.deepEqual(readdirSync(h.outside), [], tool);
    assert.equal(h.log.length, 1);
    assert.equal(h.log[0]?.ok, false);
  }
});

test("a shell grant is bound to the interpreter as well as the command", async () => {
  const h = harness();
  h.grants.approve("shell.run", `${sh}:echo hi > m.txt`);
  const other = win ? "bash" : "powershell";
  assert.equal(
    await codeOf(run(h, other, { command: "echo hi > m.txt" })),
    "GRANT_REQUIRED",
  );
  assert.equal(existsSync(join(h.root, "m.txt")), false);
  const bare = harness();
  bare.grants.approve("shell.run", "echo hi > m.txt");
  assert.equal(
    await codeOf(run(bare, sh, { command: "echo hi > m.txt" })),
    "GRANT_REQUIRED",
  );
  assert.equal(existsSync(join(bare.root, "m.txt")), false);
  assert.equal(h.log.length, 0);
});

test("grep rejects over-long patterns and nested unbounded quantifiers", async () => {
  const h = harness();
  writeFileSync(join(h.root, "a.txt"), `${"a".repeat(40)}!`);
  for (const pattern of [
    "a".repeat(257),
    "(a+)+$",
    "(.*)*x",
    "(\\w+\\s*)*z",
    "(a{1,})+b",
  ])
    assert.equal(
      await codeOf(run(h, "grep", { pattern })),
      "PATTERN_REJECTED",
      pattern.slice(0, 12),
    );
  assert.match(String(await run(h, "grep", { pattern: "(a)+!" })), /a\.txt:1:/);
  assert.match(
    String(await run(h, "grep", { pattern: "(a+)+", literal: true })),
    /^$/,
  );
});

test("grep stops at a scanned-bytes budget and at a time budget", async () => {
  const h = harness();
  const chunk = "x".repeat(900_000);
  for (let i = 0; i < 12; i++)
    writeFileSync(join(h.root, `big${String(i)}.txt`), chunk);
  assert.equal(
    await codeOf(run(h, "grep", { pattern: "needle" })),
    "GREP_BUDGET",
  );
  const t = harness({ timeoutMs: 1, maxOutputBytes: 1 << 20 });
  writeFileSync(join(t.root, "many.txt"), "line\n".repeat(150_000));
  assert.equal(
    await codeOf(run(t, "grep", { pattern: "needle" })),
    "GREP_BUDGET",
  );
});
