// TD-51 crash/migration matrix prep — failing-first integration tests.
// Uses the existing store-kill-child harness (tests/integration/store-kill-child.ts).

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Store, StoreError } from "../../packages/splyce-pi/dist/store.js";

const CHILD = fileURLToPath(new URL("./store-kill-child.ts", import.meta.url));
const tmpRoot = mkdtempSync(join(tmpdir(), "td51-crash-"));
let n = 0;
const dir = () => { n += 1; const d = join(tmpRoot, `t${n}`); mkdirSync(d); return d; };
const wait = (f: string, ms = 15000) => { const s = Date.now(); while (!existsSync(f)) { if (Date.now() - s > ms) throw new Error(`timeout ${f}`); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25); } };
const kill = (pid: number) => { const r = spawnSync("taskkill", ["/PID", String(pid), "/F", "/T"], { stdio: "ignore" }); if (r.status !== 0) throw new Error(`taskkill failed ${pid}`); };
const spawnChild = (mode: string, d: string) => spawn(process.execPath, [CHILD, mode, d], { stdio: "ignore" });

test("CM1 kill-during-append: acknowledged commit survives kill", () => {
  const d = dir();
  const child = spawnChild("commit-then-signal", d);
  wait(join(d, "ack.json"));
  const ack = JSON.parse(readFileSync(join(d, "ack.json"), "utf8")) as { seq: number };
  kill(child.pid!);
  const store = Store.open(join(d, "store.db"));
  const got = store.get("rec-child-ack");
  assert.equal(got.seq, ack.seq);
  store.close();
  rmSync(d, { recursive: true, force: true });
});

test("CM2 kill-mid-transaction: uncommitted row absent after reopen", () => {
  const d = dir();
  const child = spawnChild("mid-transaction", d);
  wait(join(d, "mid.json"));
  kill(child.pid!);
  const store = Store.open(join(d, "store.db"));
  assert.throws(() => store.get("rec-uncommitted"), (e: unknown) => e instanceof StoreError);
  store.close();
  rmSync(d, { recursive: true, force: true });
});
