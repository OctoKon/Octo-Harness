// TD-10 (issue #78): tests for C1 ancestry/events mapping (SessionMap)
// Validates invariants 1-5: 1:1 mapping, Pi-derived ancestry, event stamping,
// single channel + lifecycle, and durable idempotent run anchors.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  SessionMap,
  SessionMapError,
} from "../packages/splyce-pi/dist/session-map.js";
import { Store } from "../packages/splyce-pi/dist/store.js";

const fixtures = JSON.parse(
  readFileSync(
    new URL("./fixtures/contracts/session-map-events.json", import.meta.url),
    "utf8",
  ),
);

const tmpRoot = mkdtempSync(join(tmpdir(), "td10-session-map-"));
let tmpCounter = 0;
const freshDir = () => {
  tmpCounter += 1;
  const dir = join(tmpRoot, `t${String(tmpCounter)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const makeContext = () => ({
  configRevision: "cfg-1",
  profileRevision: "prof-1",
  policyRevision: "pol-1",
  resolveReference: () => true,
});

const createPiView = ({ id, file, parentSession, entries = [] }) => ({
  getSessionId: () => id,
  getSessionFile: () => file,
  getHeader: () => (parentSession !== undefined ? { parentSession } : null),
  getEntries: () => entries.map((eid) => ({ id: eid })),
});

test("Invariant 1: 1:1 mapping between Pi session id and native (scopeId, sessionId)", () => {
  const dir = freshDir();
  const store = Store.open(join(dir, "store.db"));
  const map = new SessionMap(store, makeContext());

  const key1 = { scopeId: "w-demo", sessionId: "s-1" };
  const pi1 = createPiView({
    id: "pi-1",
    file: "file-1.json",
    entries: ["e-1"],
  });

  // Bind succeeds and returns AncestryNode
  const node = map.bind(key1, pi1);
  assert.equal(node.scopeId, "w-demo");
  assert.equal(node.sessionId, "s-1");
  assert.equal(node.piSessionId, "pi-1");
  assert.equal(node.anchor.branchAnchorId, "ba-pi-1");
  assert.equal(node.anchor.forkPointEntryId, null);
  assert.equal(node.anchor.firstChildEntryId, "e-1");

  // resolve returns the native key
  assert.deepEqual(map.resolve("pi-1"), key1);

  // Unbound id throws SESSION_UNKNOWN
  assert.throws(
    () => map.resolve("pi-unknown"),
    (err) => err instanceof SessionMapError && err.code === "SESSION_UNKNOWN",
  );

  // Re-binding identical pair is idempotent
  const reNode = map.bind(key1, pi1);
  assert.deepEqual(reNode, node);

  // Binding same Pi session to a different native key throws SESSION_FOREIGN
  assert.throws(
    () => map.bind({ scopeId: "w-demo", sessionId: "s-2" }, pi1),
    (err) => err instanceof SessionMapError && err.code === "SESSION_FOREIGN",
  );

  // Binding a different Pi session to an already bound native key throws SESSION_FOREIGN
  const pi2 = createPiView({ id: "pi-2", file: "file-2.json" });
  assert.throws(
    () => map.bind(key1, pi2),
    (err) => err instanceof SessionMapError && err.code === "SESSION_FOREIGN",
  );
});

test("Invariant 2: Ancestry is Pi-derived, fork point and first child calculated, unbound parent returns complete: false", () => {
  const dir = freshDir();
  const store = Store.open(join(dir, "store.db"));
  const map = new SessionMap(store, makeContext());

  // Root session: entries e1, e2, e3
  const rootKey = { scopeId: "w-demo", sessionId: "s-root" };
  const rootPi = createPiView({
    id: "pi-root",
    file: "root-file.json",
    entries: ["e1", "e2", "e3"],
  });
  map.bind(rootKey, rootPi);

  const rootAncestry = map.ancestry("pi-root");
  assert.equal(rootAncestry.complete, true);
  assert.equal(rootAncestry.chain.length, 1);
  assert.equal(rootAncestry.chain[0].piSessionId, "pi-root");
  assert.equal(rootAncestry.chain[0].anchor.forkPointEntryId, null);
  assert.equal(rootAncestry.chain[0].anchor.firstChildEntryId, "e1");

  // Child branch 1: shares prefix e1, e2, then branches with e-c1, e-c2
  const childKey1 = { scopeId: "w-demo", sessionId: "s-child-1" };
  const childPi1 = createPiView({
    id: "pi-child-1",
    file: "child1-file.json",
    parentSession: "root-file.json",
    entries: ["e1", "e2", "e-c1", "e-c2"],
  });
  map.bind(childKey1, childPi1);

  const childAncestry = map.ancestry("pi-child-1");
  assert.equal(childAncestry.complete, true);
  assert.equal(childAncestry.chain.length, 2);
  // Leaf first
  assert.equal(childAncestry.chain[0].piSessionId, "pi-child-1");
  assert.equal(childAncestry.chain[0].anchor.forkPointEntryId, "e2");
  assert.equal(childAncestry.chain[0].anchor.firstChildEntryId, "e-c1");
  // Root parent
  assert.equal(childAncestry.chain[1].piSessionId, "pi-root");

  // Child branch 2: points to parentSession that is not bound
  const orphanKey = { scopeId: "w-demo", sessionId: "s-orphan" };
  const orphanPi = createPiView({
    id: "pi-orphan",
    file: "orphan-file.json",
    parentSession: "unbound-parent-file.json",
    entries: ["e-x"],
  });
  map.bind(orphanKey, orphanPi);

  const orphanAncestry = map.ancestry("pi-orphan");
  assert.equal(orphanAncestry.complete, false);
  assert.equal(orphanAncestry.chain.length, 1);
  assert.equal(orphanAncestry.chain[0].piSessionId, "pi-orphan");
  assert.equal(orphanAncestry.chain[0].anchor.forkPointEntryId, null);
  assert.equal(orphanAncestry.chain[0].anchor.firstChildEntryId, null);
});

test("Invariant 3: Event stamping and foreign rejection", () => {
  const dir = freshDir();
  const store = Store.open(join(dir, "store.db"));
  const map = new SessionMap(store, makeContext());

  const key = { scopeId: "w-demo", sessionId: "s-pub" };
  const pi = createPiView({ id: "pi-pub", file: "pub.json", entries: ["e1"] });
  map.bind(key, pi);

  // Publish before follow throws SESSION_NOT_FOLLOWED
  assert.throws(
    () => map.publish("pi-pub", fixtures.engineEvents[0]),
    (err) =>
      err instanceof SessionMapError && err.code === "SESSION_NOT_FOLLOWED",
  );

  // Follow to activate bridge channel
  const { channel } = map.follow(key, 0);
  assert.ok(channel.bridge);

  // Foreign stamped event (carries scopeId/sessionId) is rejected with SESSION_FOREIGN
  assert.throws(
    () => map.publish("pi-pub", fixtures.foreignEvent),
    (err) => err instanceof SessionMapError && err.code === "SESSION_FOREIGN",
  );

  // Durable event without scope/session: stamped and queued into bridge
  const frame1 = map.publish("pi-pub", fixtures.engineEvents[0]);
  assert.equal(frame1, undefined); // durable frame queued into bridge

  // Transient event without scope/session: stamped and queued into bridge
  const frame2 = map.publish("pi-pub", fixtures.engineEvents[1]);
  assert.equal(frame2, undefined); // transient frame queued into bridge

  // Drain frames from channel bridge to verify stamping
  const drained = channel.bridge.drain();
  assert.equal(drained.frames.length, 2);
  assert.equal(drained.frames[0].event.scopeId, "w-demo");
  assert.equal(drained.frames[0].event.sessionId, "s-pub");
  assert.equal(drained.frames[0].event.kind, "turn.started");
  assert.equal(drained.frames[1].event.scopeId, "w-demo");
  assert.equal(drained.frames[1].event.sessionId, "s-pub");
  assert.equal(drained.frames[1].event.kind, "turn.stream_delta");
});

const makeRunInput = (runId, recordId) => ({
  recordId,
  runId,
  createdAt: "2026-10-26T00:00:00.000Z",
  sourceIds: [],
  workspaceId: "w-demo",
  baseRevision: "rev-1",
  baseSnapshotId: "snap-1",
  taskArtifactId: "art-1",
  grantIds: [],
  profileId: "prof-1",
  profileRevision: "prof-1",
  roleBindingRefs: [],
  state: "running",
});

test("Invariant 4: Channel follow, replay and disposal", () => {
  const dir = freshDir();
  const store = Store.open(join(dir, "store.db"));
  const map = new SessionMap(store, makeContext());

  const key1 = { scopeId: "w-demo", sessionId: "s-chan1" };
  const pi1 = createPiView({ id: "pi-chan1", file: "chan1.json" });
  map.bind(key1, pi1);

  // Pre-seed durable records in the store for this session
  map.anchorRun("pi-chan1", makeRunInput("run-1", "run-rec-1"));
  map.anchorRun("pi-chan1", makeRunInput("run-2", "run-rec-2"));

  // Follow afterSeq 0 replays both
  const f1 = map.follow(key1, 0);
  assert.equal(f1.replay.records.length, 2);
  assert.equal(f1.replay.records[0].seq, 1);
  assert.equal(f1.replay.records[1].seq, 2);

  // Follow afterSeq 1 replays strictly after seq 1
  const f2 = map.follow(key1, 1);
  assert.equal(f2.replay.records.length, 1);
  assert.equal(f2.replay.records[0].seq, 2);

  // Follow on an unbound session throws SESSION_UNKNOWN
  assert.throws(
    () => map.follow({ scopeId: "w-demo", sessionId: "s-unbound" }, 0),
    (err) => err instanceof SessionMapError && err.code === "SESSION_UNKNOWN",
  );

  // Dispose drops binding and channel together
  map.dispose(key1);
  assert.throws(
    () => map.resolve("pi-chan1"),
    (err) => err instanceof SessionMapError && err.code === "SESSION_UNKNOWN",
  );
  assert.throws(
    () => map.follow(key1, 0),
    (err) => err instanceof SessionMapError && err.code === "SESSION_UNKNOWN",
  );

  // A later bind and follow starts a fresh channel
  map.bind(key1, pi1);
  const freshFollow = map.follow(key1, 1);
  assert.equal(freshFollow.replay.records.length, 1);
  assert.equal(freshFollow.replay.records[0].seq, 2);
  assert.notEqual(freshFollow.channel, f1.channel);
});

test("Invariant 4b: Replay isolation across multiple sessions in one scope", () => {
  const dir = freshDir();
  const store = Store.open(join(dir, "store.db"));
  const map = new SessionMap(store, makeContext());

  const key1 = { scopeId: "w-demo", sessionId: "s-iso-1" };
  const key2 = { scopeId: "w-demo", sessionId: "s-iso-2" };
  const pi1 = createPiView({ id: "pi-iso-1", file: "iso1.json" });
  const pi2 = createPiView({ id: "pi-iso-2", file: "iso2.json" });
  map.bind(key1, pi1);
  map.bind(key2, pi2);

  map.anchorRun("pi-iso-1", makeRunInput("run-iso-1a", "rec-iso-1a"));
  map.anchorRun("pi-iso-2", makeRunInput("run-iso-2a", "rec-iso-2a"));
  map.anchorRun("pi-iso-1", makeRunInput("run-iso-1b", "rec-iso-1b"));

  // s-iso-1 replay sees only its own records
  const f1 = map.follow(key1, 0);
  assert.equal(f1.replay.records.length, 2);
  assert.equal(f1.replay.records[0].record.recordId, "rec-iso-1a");
  assert.equal(f1.replay.records[1].record.recordId, "rec-iso-1b");

  // s-iso-2 replay sees only its own records
  const f2 = map.follow(key2, 0);
  assert.equal(f2.replay.records.length, 1);
  assert.equal(f2.replay.records[0].record.recordId, "rec-iso-2a");
});

test("Invariant 5: Durable run anchors are recorded and idempotent on duplicate runId", () => {
  const dir = freshDir();
  const store = Store.open(join(dir, "store.db"));
  const map = new SessionMap(store, makeContext());

  const key = { scopeId: "w-demo", sessionId: "s-anchor" };
  const pi = createPiView({
    id: "pi-anchor",
    file: "anchor.json",
    entries: ["e-start"],
  });
  map.bind(key, pi);

  const runInput = makeRunInput("run-anchored-1", "rec-anchor-1");

  const app1 = map.anchorRun("pi-anchor", runInput);
  assert.equal(app1.recordId, "rec-anchor-1");
  assert.equal(app1.seq, 1);

  // Calling anchorRun with identical runId returns the existing Appended anchor idempotently
  const app2 = map.anchorRun("pi-anchor", {
    ...runInput,
    recordId: "rec-anchor-duplicate-id", // even if caller passes different recordId, it's idempotent on runId
  });
  assert.deepEqual(app2, app1);

  // Verify only 1 record exists in store
  const listed = store.list("w-demo", 0, "s-anchor");
  assert.equal(listed.records.length, 1);
  assert.equal(listed.records[0].record.recordId, "rec-anchor-1");
});
