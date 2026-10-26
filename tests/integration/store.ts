// TD-09 / J0_store_contract — durable store commits against the merged
// contract (e8d56b5) per the TD-03 store-qualification experiment (S1–S8)
// and the TD-09 acceptance row: fresh / corrupt / read-only / reopen cases;
// failed writes acknowledge no durability.
//
// Trials per case: J0_TRIALS env (default 1). Every run prints `n` per case.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { CONTRACT_VERSION } from "@splyce/pi/contracts";
import { Store, StoreError } from "../../packages/splyce-pi/dist/store.js";

const CHILD = fileURLToPath(new URL("./store-kill-child.ts", import.meta.url));

const fixtures = JSON.parse(
  readFileSync(
    new URL("../fixtures/contracts/records.json", import.meta.url),
    "utf8",
  ),
) as Record<string, Record<string, unknown>>;

const caller = {
  sessionId: "s1",
  configRevision: "cfg1",
  profileRevision: "profile1",
  policyRevision: "policy1",
  resolveReference: () => true,
};

let counter = 0;
const record = (
  kind: keyof typeof fixtures,
  overrides: Record<string, unknown> = {},
) => {
  counter += 1;
  const base = structuredClone(fixtures[kind]) as Record<string, unknown>;
  base.recordId = `rec-${String(counter)}`;
  base.scopeId = "w-demo";
  return Object.assign(base, overrides);
};

const trials = Number(process.env["J0_TRIALS"] ?? "1");
const tmpRoot = mkdtempSync(join(tmpdir(), "j0-store-"));
let tmpCounter = 0;
const freshDir = () => {
  tmpCounter += 1;
  const dir = join(tmpRoot, `t${String(tmpCounter)}`);
  mkdirSync(dir);
  return dir;
};

const waitFor = (file: string, timeoutMs = 15000) => {
  const start = Date.now();
  while (!existsSync(file)) {
    if (Date.now() - start > timeoutMs)
      throw new Error(`timeout waiting ${file}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
};

const killTree = (pid: number) => {
  const result = spawnSync("taskkill", ["/PID", String(pid), "/F", "/T"], {
    stdio: "ignore",
  });
  if (result.status !== 0)
    throw new Error(`taskkill failed for ${String(pid)}`);
};

const spawnChild = (mode: string, dir: string) =>
  spawn(process.execPath, [CHILD, mode, dir], { stdio: "ignore" });

test("S1 fresh commit and reopen", () => {
  for (let i = 0; i < trials; i += 1) {
    const dir = freshDir();
    const path = join(dir, "store.db");
    const store = Store.open(path);
    const input = record("run");
    const appended = store.append({ kind: "run", record: input }, caller);
    const cursorAfter = store.cursor();
    store.close();

    const reopened = Store.open(path);
    const got = reopened.get(input.recordId as string);
    assert.equal(got.seq, appended.seq);
    assert.equal(
      (got.record as Record<string, unknown>).schemaVersion,
      CONTRACT_VERSION,
    );
    assert.equal(reopened.cursor(), appended.seq);
    assert.equal(cursorAfter, appended.seq);
    reopened.close();
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`S1 n=${String(trials)} pass`);
});

test("S2 forced kill mid-transaction (child processes)", () => {
  for (let i = 0; i < trials; i += 1) {
    // killed after acknowledged commit: the record must be present.
    {
      const dir = freshDir();
      const child = spawnChild("commit-then-signal", dir);
      waitFor(join(dir, "ack.json"));
      const ack = JSON.parse(readFileSync(join(dir, "ack.json"), "utf8")) as {
        seq: number;
      };
      killTree(child.pid as number);
      const reopened = Store.open(join(dir, "store.db"));
      assert.ok(reopened.cursor() >= ack.seq);
      const got = reopened.get("rec-child-ack");
      assert.equal(got.seq, ack.seq);
      reopened.close();
      rmSync(dir, { recursive: true, force: true });
    }
    // killed inside an open transaction: nothing committed, never partial.
    {
      const dir = freshDir();
      const child = spawnChild("mid-transaction", dir);
      waitFor(join(dir, "mid.json"));
      killTree(child.pid as number);
      const reopened = Store.open(join(dir, "store.db"));
      // the acknowledged first append survives; the uncommitted one must not.
      assert.ok(reopened.get("rec-child-open"));
      assert.throws(() => reopened.get("rec-uncommitted"), StoreError);
      const { records } = reopened.list("w-demo");
      assert.ok(!records.some((r) => r.record.recordId === "rec-uncommitted"));
      reopened.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }
  console.log(`S2 n=${String(trials * 2)} pass (2 kills per trial)`);
});

test("S3 unwritable target: explicit error, no acknowledgement, no fallback", () => {
  for (let i = 0; i < trials; i += 1) {
    const dir = freshDir();
    const path = join(dir, "store.db");
    const store = Store.open(path);
    const seeded = store.append({ kind: "run", record: record("run") }, caller);
    store.close();

    // (a) explicitly read-only handle: the write fails before any
    // acknowledgement and nothing silently falls back to memory.
    const readOnly = Store.open(path, { readOnly: true });
    assert.throws(
      () => readOnly.append({ kind: "run", record: record("run") }, caller),
      (error: unknown) =>
        error instanceof StoreError &&
        error.code === "STORE_READ_ONLY" &&
        error.errcode === 8,
    );
    readOnly.close();

    // (b) read-only file attribute: opening/committing fails closed.
    chmodSync(path, 0o444);
    let refused = false;
    try {
      const ro = Store.open(path);
      try {
        ro.append({ kind: "run", record: record("run") }, caller);
      } finally {
        ro.close();
      }
    } catch (error) {
      refused = error instanceof StoreError;
    }
    assert.ok(refused, "read-only file must fail closed");
    chmodSync(path, 0o666);

    // No acknowledged change: the durable cursor is still the seeded one.
    const verify = Store.open(path);
    assert.equal(verify.cursor(), seeded.seq);
    verify.close();
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`S3 n=${String(trials)} pass`);
});

test("S4 corrupt or truncated file fails closed", () => {
  for (let i = 0; i < trials; i += 1) {
    // (a) garbage bytes are not a store.
    const dir = freshDir();
    const path = join(dir, "garbage.db");
    writeFileSync(
      path,
      Buffer.from("definitely not a sqlite database file"),
      "utf8",
    );
    assert.throws(
      () => Store.open(path),
      (error: unknown) =>
        error instanceof StoreError &&
        error.code === "STORE_CORRUPT" &&
        error.errcode === 26,
    );
    rmSync(dir, { recursive: true, force: true });

    // (b) a truncated/garbage -wal beside a copy: reopen stays readable with
    // no partial or invented data.
    const dir2 = freshDir();
    const path2 = join(dir2, "store.db");
    const store = Store.open(path2);
    const input = record("run");
    const appended = store.append({ kind: "run", record: input }, caller);
    store.close();
    copyFileSync(path2, join(dir2, "copy.db"));
    // Simulate a truncated/garbage WAL left beside the copy. After a clean
    // close SQLite checkpoints and removes the WAL, so we overwrite whatever
    // is (or is not) there with junk bytes.
    writeFileSync(
      join(dir2, "copy.db-wal"),
      Buffer.from("junk-wal-bytes"),
      "utf8",
    );
    const reopened = Store.open(join(dir2, "copy.db"));
    // No partial read and no invented data: exactly the acknowledged record.
    const { records, skippedUnknownSchema } = reopened.list("w-demo");
    assert.equal(skippedUnknownSchema, 0);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.seq, appended.seq);
    assert.equal(records[0]?.record.recordId, input.recordId);
    reopened.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(dir2, { recursive: true, force: true });
  }
  console.log(`S4 n=${String(trials * 2)} pass (garbage + truncated wal)`);
});

test("S5 unknown required schema is rejected on read; the rest stays readable", () => {
  for (let i = 0; i < trials; i += 1) {
    const dir = freshDir();
    const store = Store.open(join(dir, "store.db"));
    const first = record("run");
    const second = record("run");
    store.append({ kind: "run", record: first }, caller);
    store.append({ kind: "run", record: second }, caller);
    store.close();
    const raw = new DatabaseSync(join(dir, "store.db"), { timeout: 5000 });
    raw
      .prepare("UPDATE records SET schema_version = ? WHERE record_id = ?")
      .run(999, second.recordId);
    raw.close();

    const reopened = Store.open(join(dir, "store.db"));
    assert.throws(
      () => reopened.get(second.recordId as string),
      (error: unknown) =>
        error instanceof StoreError && error.code === "UNKNOWN_SCHEMA",
    );
    const got = reopened.get(first.recordId as string);
    assert.equal(got.record.recordId, first.recordId);
    const listed = reopened.list("w-demo");
    assert.equal(listed.records.length, 1);
    assert.equal(listed.skippedUnknownSchema, 1);
    reopened.close();
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`S5 n=${String(trials)} pass`);
});

test("S6 second writer: one commits, the other gets a busy error; no lost update", () => {
  for (let i = 0; i < trials; i += 1) {
    const dir = freshDir();
    const path = join(dir, "store.db");
    const store = Store.open(path);
    store.append({ kind: "run", record: record("run") }, caller);

    const child = spawnChild("busy-hold", dir);
    waitFor(join(dir, "held.json"));

    // Zero-ish timeout: the parent's second write must fail explicitly — the
    // busy error surfaces at open (migration is a write transaction) or at
    // append; either way it is explicit, before any acknowledgement.
    let contender: Store | undefined;
    let refused = false;
    try {
      contender = Store.open(path, { busyTimeoutMs: 200 });
      assert.throws(
        () => contender?.append({ kind: "run", record: record("run") }, caller),
        (error: unknown) =>
          error instanceof StoreError && error.code === "STORE_BUSY",
      );
    } catch (error) {
      refused = error instanceof StoreError && error.code === "STORE_BUSY";
      if (!refused) throw error;
    } finally {
      // Always release the holder, even when the assertion above fails.
      writeFileSync(join(dir, "release.json"), "{}", "utf8");
      contender?.close();
    }
    assert.ok(refused, "second writer must be refused with STORE_BUSY");

    // The holder commits; nothing is lost or interleaved.
    waitFor(join(dir, "child-trace-committed.json"));
    store.close();
    const reopened = Store.open(path);
    assert.ok(reopened.get("rec-child-second"));
    reopened.close();
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`S6 n=${String(trials)} pass`);
});

test("S7 backup and restore with deletion-epoch guard", () => {
  for (let i = 0; i < trials; i += 1) {
    const dir = freshDir();
    const path = join(dir, "store.db");
    const store = Store.open(path);
    const a = record("run");
    const b = record("run");
    store.append({ kind: "run", record: a }, caller);
    store.append({ kind: "run", record: b }, caller);

    // Delete A, snapshot; then delete B: the snapshot's deletion epoch (1) is
    // behind the live epoch (2), so restoring it would lose B's tombstone.
    store.noteDeletion(a.recordId as string);
    const backupPath = join(dir, "backup.db");
    store.backup(backupPath);
    store.noteDeletion(b.recordId as string);
    assert.throws(
      () => store.restore(backupPath),
      (error: unknown) =>
        error instanceof StoreError && error.code === "STALE_RESTORE",
    );

    // A current-epoch snapshot restores cleanly, and the restore is
    // observable: post-snapshot record `c` is gone afterwards.
    const freshBackup = join(dir, "backup2.db");
    store.backup(freshBackup);
    const c = record("run");
    store.append({ kind: "run", record: c }, caller);
    store.close();

    const reopened = Store.open(path);
    reopened.restore(freshBackup);
    assert.ok(reopened.get(a.recordId as string));
    assert.ok(reopened.get(b.recordId as string));
    assert.throws(() => reopened.get(c.recordId as string), StoreError);
    assert.equal(Store.deletionEpochOf(path), 2);
    reopened.close();
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`S7 n=${String(trials)} pass`);
});

test("batch rollback: duplicate mid-batch leaves nothing acknowledged and the handle clean", () => {
  const dir = freshDir();
  const path = join(dir, "store.db");
  const store = Store.open(path);
  const dup = record("run");
  assert.throws(() =>
    store.appendBatch(
      [
        { kind: "run", record: dup },
        { kind: "run", record: dup }, // same record_id: UNIQUE violation mid-batch
      ],
      caller,
    ),
  );
  // The same handle rolls back cleanly and the next write succeeds.
  const next = store.append({ kind: "run", record: record("run") }, caller);
  assert.equal(next.seq, 1);
  store.close();

  // From a fresh connection: exactly the post-rollback acknowledged write.
  const verify = Store.open(path);
  assert.equal(verify.cursor(), 1);
  const { records } = verify.list("w-demo");
  assert.equal(records.length, 1);
  verify.close();
  rmSync(dir, { recursive: true, force: true });
});

test("durable canonical-workspace ownership: single writer, CAS epoch", () => {
  const dir = freshDir();
  const path = join(dir, "store.db");
  const store = Store.open(path);
  const ws = "C:\\workspaces\\demo"; // canonical workspace id

  // First writer wins; epoch starts at 1.
  const a = store.acquireWorkspace(ws, "session-a");
  assert.equal(a.ownerSessionId, "session-a");
  assert.equal(a.epoch, 1);

  // A second session cannot acquire a live workspace.
  assert.throws(
    () => store.acquireWorkspace(ws, "session-b"),
    (error: unknown) =>
      error instanceof StoreError && error.code === "OWNERSHIP_CONFLICT",
  );

  // Renewal is a CAS on the epoch: stale epochs are refused.
  const renewed = store.renewWorkspace(ws, "session-a", 1);
  assert.equal(renewed.epoch, 2);
  assert.throws(
    () => store.renewWorkspace(ws, "session-a", 1),
    (error: unknown) =>
      error instanceof StoreError && error.code === "OWNERSHIP_STALE_EPOCH",
  );
  assert.throws(
    () => store.renewWorkspace(ws, "session-b", 2),
    (error: unknown) =>
      error instanceof StoreError && error.code === "OWNERSHIP_CONFLICT",
  );

  // Release requires the current epoch; afterwards another session acquires.
  assert.throws(
    () => store.releaseWorkspace(ws, "session-a", 1),
    (error: unknown) =>
      error instanceof StoreError && error.code === "OWNERSHIP_STALE_EPOCH",
  );
  store.releaseWorkspace(ws, "session-a", 2);
  assert.equal(store.workspaceOwner(ws), undefined);
  const b = store.acquireWorkspace(ws, "session-b");
  assert.equal(b.epoch, 3); // epochs never repeat

  // Ownership survives reopen: it is durable state, not memory.
  store.close();
  const reopened = Store.open(path);
  const owner = reopened.workspaceOwner(ws);
  assert.equal(owner?.ownerSessionId, "session-b");
  assert.equal(owner?.epoch, 3);
  reopened.close();
  rmSync(dir, { recursive: true, force: true });
});

test("S8 export and import: ids, ordering and schemaVersion survive", () => {
  for (let i = 0; i < trials; i += 1) {
    const dir = freshDir();
    const source = Store.open(join(dir, "source.db"));
    const one = record("run");
    const two = record("run");
    source.append({ kind: "run", record: one }, caller);
    source.append({ kind: "run", record: two }, caller);
    const jsonl = join(dir, "export.jsonl");
    const count = source.exportJSONL(jsonl);
    assert.equal(count, 2);
    source.close();

    const target = Store.open(join(dir, "target.db"));
    target.importJSONL(jsonl, caller);
    const listed = target.list("w-demo");
    assert.equal(listed.records.length, 2);
    assert.equal(listed.records[0]?.record.recordId, one.recordId);
    assert.equal(listed.records[1]?.record.recordId, two.recordId);
    assert.equal(
      (listed.records[1]?.record as Record<string, unknown>).schemaVersion,
      CONTRACT_VERSION,
    );
    target.close();
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`S8 n=${String(trials)} pass`);
});

test("failed writes acknowledge no durability", () => {
  const dir = freshDir();
  const store = Store.open(join(dir, "store.db"));
  const before = store.cursor();
  // A non-object payload violates the record contract (JSON object shape).
  assert.throws(() =>
    store.append({ kind: "run", record: "not-a-record" }, caller),
  );
  assert.equal(store.cursor(), before);

  // Atomic batch: an invalid member rolls the whole batch back.
  assert.throws(() =>
    store.appendBatch(
      [
        { kind: "run", record: record("run") },
        { kind: "run", record: "not-a-record" },
      ],
      caller,
    ),
  );
  const listed = store.list("w-demo");
  assert.equal(listed.records.length, before);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});
