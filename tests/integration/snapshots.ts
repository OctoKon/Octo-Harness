// TD-24 / C5_dirty_snapshot — failing-first stale-verification tests.
// Immutable candidate/input manifest from dirty tracked/untracked fixture;
// unchanged HEAD with changed relevant bytes invalidates prior verifier;
// excluded output cannot hide verifier input.
//
// This file is intentionally failing-first: src/snapshots.ts does not exist yet.
// Tests describe the expected contract; implementation lands in TD-24 proper.

import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { Store } from "../../packages/splyce-pi/dist/store.js";
import {
  Snapshot,
  SnapshotError,
  createSnapshot,
  verifyStale,
} from "../../src/snapshots.ts";

const tmpRoot = mkdtempSync(join(tmpdir(), "td24-snapshots-"));
let counter = 0;
const freshDir = () => {
  counter += 1;
  const dir = join(tmpRoot, `t${String(counter)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

test("createSnapshot builds an immutable manifest from dirty tracked+untracked files", () => {
  const dir = freshDir();
  // init git repo
  execSync("git init -q", { cwd: dir });
  execSync("git config user.email test@test.com", { cwd: dir });
  execSync("git config user.name test", { cwd: dir });
  // tracked file (committed)
  writeFileSync(join(dir, "tracked.ts"), "export const x = 1;");
  execSync("git add tracked.ts", { cwd: dir });
  execSync("git commit -q -m init", { cwd: dir });
  // modify tracked file (dirty)
  writeFileSync(join(dir, "tracked.ts"), "export const x = 2;");
  // untracked file
  writeFileSync(join(dir, "untracked.ts"), "export const y = 2;");

  const snap = createSnapshot(dir);
  assert.ok(snap instanceof Snapshot);
  // Manifest is frozen/immutable.
  assert.throws(() => {
    (snap as unknown as Record<string, unknown>).head = "tampered";
  });
  // Contains both tracked and untracked entries.
  assert.ok(snap.manifest.tracked.length >= 1);
  assert.ok(snap.manifest.untracked.length >= 1);
  // Each entry carries path + content hash.
  for (const entry of [...snap.manifest.tracked, ...snap.manifest.untracked]) {
    assert.equal(typeof entry.path, "string");
    assert.equal(typeof entry.sha256, "string");
    assert.equal(entry.sha256.length, 64);
  }
});

test("verifyStale: unchanged HEAD with changed relevant bytes invalidates prior verifier", () => {
  const dir = freshDir();
  writeFileSync(join(dir, "relevant.ts"), "export const v = 1;");
  const snap = createSnapshot(dir);

  // Simulate: HEAD unchanged but relevant bytes changed.
  writeFileSync(join(dir, "relevant.ts"), "export const v = 2;");

  assert.throws(
    () => verifyStale(snap, dir),
    (err: unknown) =>
      err instanceof SnapshotError && err.code === "STALE_RELEVANT_BYTES",
  );
});

test("verifyStale: matching bytes pass verification", () => {
  const dir = freshDir();
  writeFileSync(join(dir, "relevant.ts"), "export const v = 1;");
  const snap = createSnapshot(dir);

  // No changes -> not stale.
  assert.doesNotThrow(() => verifyStale(snap, dir));
});

test("verifyStale: excluded output cannot hide verifier input", () => {
  const dir = freshDir();
  writeFileSync(join(dir, "input.ts"), "export const i = 1;");
  writeFileSync(join(dir, "output.log"), "generated noise");
  const snap = createSnapshot(dir, { exclude: ["*.log"] });

  // Mutate an excluded output file -> should NOT affect staleness.
  writeFileSync(join(dir, "output.log"), "different noise");
  assert.doesNotThrow(() => verifyStale(snap, dir));

  // Mutate a non-excluded input file -> stale.
  writeFileSync(join(dir, "input.ts"), "export const i = 2;");
  assert.throws(
    () => verifyStale(snap, dir),
    (err: unknown) =>
      err instanceof SnapshotError && err.code === "STALE_RELEVANT_BYTES",
  );
});

test("snapshot persists to store and round-trips", () => {
  const dir = freshDir();
  writeFileSync(join(dir, "tracked.ts"), "export const x = 1;");
  const store = Store.open(join(dir, "store.db"));
  const snap = createSnapshot(dir);
  const persisted = snap.persist(store);
  assert.equal(typeof persisted.seq, "number");

  const loaded = Snapshot.load(store, persisted.seq);
  assert.deepEqual(loaded.manifest, snap.manifest);
  store.close();
});

test("createSnapshot rejects empty directory", () => {
  const dir = freshDir();
  assert.throws(
    () => createSnapshot(dir),
    (err: unknown) =>
      err instanceof SnapshotError && err.code === "EMPTY_SNAPSHOT",
  );
});
