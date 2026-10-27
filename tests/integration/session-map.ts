// TD-10 / C1_session_catalog — Pi session ↔ native (scopeId, sessionId) map,
// Pi-derived ancestry across fork/branch/resume with durable branch anchors,
// one channel per session and native-owned event identity, on a real Store
// and real Pi SessionManagers.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { SessionMap } from "@splyce/pi/session-map";
import { Store } from "../../packages/splyce-pi/dist/store.js";

const fixture = JSON.parse(
  readFileSync(
    new URL("../fixtures/contracts/session-map-events.json", import.meta.url),
    "utf8",
  ),
);
const root = mkdtempSync(join(tmpdir(), "td10-session-map-"));
after(() => rmSync(root, { recursive: true, force: true }));
let dirs = 0;
const fresh = () => {
  dirs += 1;
  const dir = join(root, `t${String(dirs)}`);
  mkdirSync(dir);
  return dir;
};

const context = {
  configRevision: "cfg1",
  profileRevision: "profile1",
  policyRevision: "policy1",
  resolveReference: () => true,
};
const k1 = { scopeId: "w-demo", sessionId: "s1" };
const k2 = { scopeId: "w-demo", sessionId: "s2" };
const code = (c: string) => (e: unknown) => (e as { code?: string }).code === c;

// Pi only writes a session file once it holds a conversation.
const converse = (pi: SessionManager, text: string): [string, string] => {
  const user = pi.appendMessage({
    role: "user",
    content: text,
    timestamp: Date.now(),
  });
  const reply = pi.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: `re ${text}` }],
    api: "openai-completions",
    provider: "fixture",
    model: "fixture",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  } as never);
  return [user, reply];
};

const run = (runId: string) => ({
  schemaVersion: 1,
  recordId: `rec-${runId}`,
  createdAt: "2026-10-26T00:00:00.000Z",
  scopeId: "w-demo",
  sourceIds: [],
  runId,
  workspaceId: "ws-1",
  baseRevision: "rev-1",
  baseSnapshotId: "snap-1",
  taskArtifactId: "task-1",
  grantIds: [],
  profileId: "profile-1",
  profileRevision: "profile1",
  roleBindingRefs: [],
  state: "pending" as const,
});

type Stored = { seq: number; kind: string; record: Record<string, unknown> };
const records = (store: Store, sessionId: string, kind: string) =>
  (store.list("w-demo", 0, sessionId).records as Stored[]).filter(
    (r) => r.kind === kind,
  );
const anchorIds = (map: SessionMap, piSessionId: string) =>
  map
    .ancestry(piSessionId)
    .chain.map(
      (n: { anchor: { branchAnchorId: string } }) => n.anchor.branchAnchorId,
    );

const setup = () => {
  const dir = fresh();
  const store = Store.open(join(dir, "store.db"));
  const pi = SessionManager.create(dir, join(dir, "pi"));
  converse(pi, "hello");
  return { dir, store, pi, map: new SessionMap(store, context) };
};

test("unknown and foreign sessions are rejected; same-pair rebind is idempotent", () => {
  const { dir, store, pi, map } = setup();
  const other = SessionManager.create(dir, join(dir, "pi"));
  const id = pi.getSessionId();
  assert.throws(() => map.resolve(id), code("SESSION_UNKNOWN"));
  assert.throws(() => map.ancestry(id), code("SESSION_UNKNOWN"));
  assert.throws(() => map.follow(k1, 0), code("SESSION_UNKNOWN"));
  assert.throws(
    () => map.publish(id, fixture.engineEvents[0]),
    code("SESSION_UNKNOWN"),
  );
  assert.throws(() => map.anchorRun(id, run("r0")), code("SESSION_UNKNOWN"));

  const first = map.bind(k1, pi);
  assert.deepEqual(map.bind(k1, pi), first);
  assert.deepEqual(map.resolve(id), k1);
  // Same Pi session under another native key, and another Pi session under
  // an occupied key, are both foreign.
  assert.throws(() => map.bind(k2, pi), code("SESSION_FOREIGN"));
  assert.throws(() => map.bind(k1, other), code("SESSION_FOREIGN"));
  assert.deepEqual(map.resolve(id), k1);
  // A run anchor cannot claim another scope than the bound one.
  assert.throws(
    () => map.anchorRun(id, { ...run("r1"), scopeId: "w-other" }),
    code("SESSION_FOREIGN"),
  );
  assert.equal(store.list("w-other").records.length, 0);
  store.close();
});

test("an unbound parent stays unresolved: complete is false and nothing is guessed", () => {
  const { dir, store, pi: parent, map } = setup();
  const child = SessionManager.forkFrom(
    parent.getSessionFile()!,
    dir,
    join(dir, "pi"),
  );
  map.bind(k2, child);
  const orphan = map.ancestry(child.getSessionId());
  assert.equal(orphan.complete, false);
  assert.equal(orphan.chain.length, 1);
  assert.deepEqual(orphan.chain[0]!.anchor, {
    branchAnchorId: orphan.chain[0]!.anchor.branchAnchorId,
    piSessionId: child.getSessionId(),
    parentAnchorId: null,
    forkPointEntryId: null,
    firstChildEntryId: null,
    activeLeafEntryId: child.getLeafId(),
  });
  map.bind(k1, parent);
  assert.equal(map.ancestry(child.getSessionId()).complete, true);
  store.close();
});

test("fork ancestry is Pi-derived and durable: resolution persists, resume never duplicates", () => {
  const { dir, store, pi: parent, map } = setup();
  const parentLast = parent.getLeafId();
  const child = SessionManager.forkFrom(
    parent.getSessionFile()!,
    dir,
    join(dir, "pi"),
  );
  map.bind(k1, parent);
  map.bind(k2, child);
  const forked = map.ancestry(child.getSessionId());
  assert.equal(forked.complete, true);
  assert.deepEqual(
    forked.chain.map((n) => [n.piSessionId, n.scopeId, n.sessionId]),
    [
      [child.getSessionId(), "w-demo", "s2"],
      [parent.getSessionId(), "w-demo", "s1"],
    ],
  );
  const childAnchor = forked.chain[0]!.anchor;
  assert.equal(childAnchor.forkPointEntryId, parentLast);
  assert.equal(childAnchor.firstChildEntryId, null);
  assert.equal(
    childAnchor.parentAnchorId,
    forked.chain[1]!.anchor.branchAnchorId,
  );
  assert.equal(forked.chain[1]!.anchor.forkPointEntryId, null);
  assert.equal(forked.chain[1]!.anchor.parentAnchorId, null);

  // The first child entry resolves only once Pi actually has one, and the
  // resolution is appended next to (not over) the pending record.
  const [firstChild] = converse(child, "child turn");
  const resolved = map.ancestry(child.getSessionId());
  assert.equal(resolved.chain[0]!.anchor.firstChildEntryId, firstChild);
  assert.equal(
    resolved.chain[0]!.anchor.branchAnchorId,
    childAnchor.branchAnchorId,
  );
  const anchored = map.anchorRun(child.getSessionId(), run("r-fork"));
  assert.deepEqual(
    map.anchorRun(child.getSessionId(), run("r-fork")),
    anchored,
  );
  const persisted = records(store, "s2", "branchAnchor").filter(
    (r) => r.record.branchAnchorId === childAnchor.branchAnchorId,
  );
  assert.deepEqual(
    persisted.map((r) => r.record.firstChildEntryId),
    [null, firstChild],
  );
  assert.deepEqual(
    persisted.map((r) => r.record.forkPointEntryId),
    [parentLast, parentLast],
  );

  // Resume: a new process reopens the store and Pi files.
  const childFile = child.getSessionFile()!;
  const parentFile = parent.getSessionFile()!;
  store.close();
  const reopened = Store.open(join(dir, "store.db"));
  const resumed = new SessionMap(reopened, context);
  const child2 = SessionManager.open(childFile, join(dir, "pi"));
  resumed.bind(k1, SessionManager.open(parentFile, join(dir, "pi")));
  resumed.bind(k2, child2);
  assert.deepEqual(resumed.ancestry(child2.getSessionId()), resolved);
  assert.deepEqual(
    resumed.anchorRun(child2.getSessionId(), run("r-fork")),
    anchored,
  );
  assert.equal(
    records(reopened, "s2", "branchAnchor").length,
    persisted.length,
  );
  const runs = records(reopened, "s2", "run");
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.record.piSessionId, child.getSessionId());
  assert.equal(runs[0]!.record.branchAnchorId, childAnchor.branchAnchorId);
  reopened.close();
});

test("intra-session branch switches get distinct anchors; switching back restores the original", () => {
  const { store, pi, map } = setup();
  const id = pi.getSessionId();
  const [trunkUser] = converse(pi, "trunk");
  map.bind(k1, pi);
  const trunk = anchorIds(map, id);
  assert.equal(trunk.length, 1);
  const trunkLeaf = pi.getLeafId();

  // Branch B off the trunk turn, then abandon it for branch C.
  pi.branch(trunkUser);
  converse(pi, "branch b");
  const b = anchorIds(map, id);
  assert.deepEqual(b.slice(1), trunk);
  assert.notEqual(b[0], trunk[0]);
  const bLeaf = pi.getLeafId()!;
  map.anchorRun(id, run("r-b"));

  pi.branch(trunkUser);
  converse(pi, "branch c");
  const c = anchorIds(map, id);
  assert.deepEqual(c.slice(1), trunk);
  assert.notEqual(c[0], b[0]);
  assert.ok(!c.includes(b[0]!), "abandoned branch is not active ancestry");
  const cAnchor = map.ancestry(id).chain[0]!.anchor;
  assert.equal(cAnchor.forkPointEntryId, trunkUser);
  assert.equal(cAnchor.parentAnchorId, trunk[0]);
  map.anchorRun(id, run("r-c"));

  // Switching back resolves the original anchors, not new ones.
  pi.branch(bLeaf);
  assert.deepEqual(anchorIds(map, id), b);
  pi.branch(trunkLeaf!);
  assert.deepEqual(anchorIds(map, id), trunk);

  // Each run is anchored to the branch that was active when it started.
  const runs = records(store, "s1", "run");
  assert.deepEqual(
    runs.map((r) => [r.record.runId, r.record.branchAnchorId]),
    [
      ["r-b", b[0]],
      ["r-c", c[0]],
    ],
  );
  store.close();
});

test("one channel per (scope, session); unfollow releases the channel, dispose ends the session", () => {
  const { dir, store, pi, map } = setup();
  const pi2 = SessionManager.create(dir, join(dir, "pi"));
  map.bind(k1, pi);
  map.bind(k2, pi2);
  const a = map.follow(k1, 0).channel;
  assert.equal(map.follow(k1, 0).channel, a);
  assert.equal(map.follow(k1, 0).channel.bridge, a.bridge);
  const b = map.follow(k2, 0).channel;
  assert.notEqual(b, a);
  assert.deepEqual([a.scopeId, a.sessionId], ["w-demo", "s1"]);

  // Unfollow: the renderer leaves, the session (binding) stays.
  map.unfollow(k1);
  map.unfollow(k1);
  assert.deepEqual(map.resolve(pi.getSessionId()), k1);
  const a2 = map.follow(k1, 0).channel;
  assert.notEqual(a2, a);

  // Dispose: the session ends; binding and channel go together.
  map.dispose(k1);
  map.dispose(k1);
  assert.throws(() => map.follow(k1, 0), code("SESSION_UNKNOWN"));
  assert.throws(() => map.resolve(pi.getSessionId()), code("SESSION_UNKNOWN"));
  assert.equal(map.follow(k2, 0).channel, b);
  map.bind(k1, pi);
  assert.notEqual(map.follow(k1, 0).channel, a2);
  store.close();
});

test("published events carry the native scope/session; engine identity is rejected", () => {
  const { store, pi, map } = setup();
  map.bind(k1, pi);
  const id = pi.getSessionId();
  map.anchorRun(id, run("run-1"));
  const { channel } = map.follow(k1, 0);
  for (const event of fixture.engineEvents) map.publish(id, event);
  assert.throws(
    () => map.publish(id, fixture.foreignEvent),
    code("SESSION_FOREIGN"),
  );
  const { sessionId, scopeId, seq, ...unscoped } = fixture.foreignEvent;
  assert.throws(
    () => map.publish(id, { ...unscoped, sessionId }),
    code("SESSION_FOREIGN"),
  );
  assert.throws(
    () => map.publish(id, { ...unscoped, scopeId: "w-demo" }),
    code("SESSION_FOREIGN"),
  );
  // seq is the ledger's, never the engine's.
  assert.throws(
    () => map.publish(id, { ...unscoped, seq }),
    code("SESSION_FOREIGN"),
  );
  const frames = channel.bridge.drain().frames;
  assert.deepEqual(
    frames.map((f: { event: Record<string, unknown> }) => [
      f.event.eventId,
      f.event.scopeId,
      f.event.sessionId,
      f.event.seq,
    ]),
    [
      ["evt-1", "w-demo", "s1", 1],
      ["evt-2", "w-demo", "s1", 2],
    ],
  );
  store.close();
});

const contractError = (e: unknown) => /contract/i.test((e as Error).message);
const durableEvent = (eventId: string, turnId = eventId) => ({
  ...fixture.engineEvents[0],
  eventId,
  payload: { runId: "run-1", turnId },
});

test("without a follower publish commits durable events through the ledger and a later follow replays them", () => {
  const { dir, store, pi, map } = setup();
  map.bind(k1, pi);
  const id = pi.getSessionId();
  map.anchorRun(id, run("run-1"));
  const published = map.publish(id, fixture.engineEvents[0]);
  assert.equal(published.frame, undefined);
  assert.equal(published.event.seq, 1);
  assert.equal(store.eventCursor("w-demo", "s1"), 1);
  // Validation still runs first: an invalid event commits nothing.
  const [durable] = fixture.engineEvents;
  assert.throws(
    () => map.publish(id, { ...durable, eventId: "x", kind: "unknown.kind" }),
    contractError,
  );
  assert.throws(
    () => map.publish(id, { ...durable, eventId: "y", durable: false }),
    contractError,
  );
  assert.equal(store.eventCursor("w-demo", "s1"), 1);
  // A later follower — even in a new process — replays the committed envelope.
  const { channel, replay } = map.follow(k1, 0);
  assert.deepEqual(replay, [published.event]);
  assert.equal(channel.bridge.status().pendingFrames, 0);
  const file = pi.getSessionFile()!;
  store.close();
  const reopened = Store.open(join(dir, "store.db"));
  const resumed = new SessionMap(reopened, context);
  resumed.bind(k1, SessionManager.open(file, join(dir, "pi")));
  assert.deepEqual(resumed.follow(k1, 0).replay, [published.event]);
  reopened.close();
});

test("follow replays real SplyceEvents for this session only, never stored records", () => {
  const { dir, store, pi, map } = setup();
  const pi2 = SessionManager.create(dir, join(dir, "pi"));
  map.bind(k1, pi);
  map.bind(k2, pi2);
  map.anchorRun(pi.getSessionId(), run("run-1"));
  map.anchorRun(pi2.getSessionId(), run("run-2"));
  const a = map.publish(pi.getSessionId(), durableEvent("e-a")).event;
  map.publish(pi2.getSessionId(), {
    ...durableEvent("e-other"),
    recordId: "rec-run-2",
    payload: { runId: "run-2", turnId: "t-o" },
  });
  const b = map.publish(pi.getSessionId(), durableEvent("e-b")).event;
  const { replay } = map.follow(k1, 0);
  assert.deepEqual(replay, [a, b]);
  for (const event of replay) {
    assert.equal(Object.hasOwn(event, "record"), false);
    assert.deepEqual(
      [event.scopeId, event.sessionId, event.kind, event.durable],
      ["w-demo", "s1", "turn.started", true],
    );
  }
  assert.deepEqual(
    replay.map((e) => e.seq),
    [1, 2],
  );
  store.close();
});

test("a durable event commits atomically with its receipt", () => {
  const { store, pi, map } = setup();
  map.bind(k1, pi);
  const id = pi.getSessionId();
  const receipt = { kind: "run" as const, record: { ...run("run-1") } };
  receipt.record = {
    ...receipt.record,
    piSessionId: id,
    branchAnchorId: map.ancestry(id).chain[0]!.anchor.branchAnchorId,
  } as never;
  const first = map.publish(id, fixture.engineEvents[0], [receipt]).event;
  assert.equal(records(store, "s1", "run").length, 1);
  // A rejected event (reused eventId) leaves its receipt uncommitted too.
  assert.throws(() =>
    map.publish(id, fixture.engineEvents[0], [
      {
        kind: "run",
        record: { ...receipt.record, recordId: "rec-run-x", runId: "run-x" },
      },
    ]),
  );
  assert.equal(records(store, "s1", "run").length, 1);
  assert.deepEqual(map.follow(k1, 0).replay, [first]);
  store.close();
});

test("a replay range crossing a lost transient seq leads with a committed run.reconnect_snapshot", () => {
  const { store, pi, map } = setup();
  map.bind(k1, pi);
  const id = pi.getSessionId();
  map.anchorRun(id, run("run-1"));
  const [d1, delta] = fixture.engineEvents;
  const one = map.publish(id, d1).event;
  assert.equal(map.publish(id, delta).event.seq, 2);
  const three = map.publish(id, durableEvent("evt-3")).event;
  // The transient payload is not retained anywhere in the store.
  assert.equal(
    JSON.stringify(store.list("w-demo").records).includes('"hi"'),
    false,
  );

  const crossed = map.follow(k1, 0).replay;
  const [snapshot, ...rest] = crossed;
  assert.deepEqual(rest, [one, three]);
  assert.equal(snapshot!.kind, "run.reconnect_snapshot");
  assert.equal(snapshot!.seq, 4);
  assert.equal(snapshot!.durable, true);
  assert.deepEqual([snapshot!.scopeId, snapshot!.sessionId], ["w-demo", "s1"]);
  assert.deepEqual(snapshot!.payload, {
    runId: "run-1",
    lastDurableSeq: 3,
    activeActionIds: [],
    state: "ready",
  });
  // The snapshot is a real ledger event: it replays like any other.
  assert.deepEqual(store.replayEvents("w-demo", "s1", 3), [snapshot]);
  // A cursor past the gap is gapless: no new snapshot.
  assert.deepEqual(map.follow(k1, 2).replay, [three, snapshot]);
  // A trailing lost transient is a gap too.
  map.publish(id, { ...delta, eventId: "evt-5" });
  const trailing = map.follow(k1, 4).replay;
  assert.equal(trailing.length, 1);
  assert.equal(trailing[0]!.kind, "run.reconnect_snapshot");
  assert.equal(trailing[0]!.seq, 6);
  store.close();
});

test("resubscribe continues the session event cursor without gaps or foreign events", () => {
  const { dir, store, pi, map } = setup();
  const pi2 = SessionManager.create(dir, join(dir, "pi"));
  map.bind(k1, pi);
  map.bind(k2, pi2);
  map.anchorRun(pi.getSessionId(), run("run-1"));
  const a = map.publish(pi.getSessionId(), durableEvent("e-a")).event;
  const b = map.publish(pi.getSessionId(), durableEvent("e-b")).event;
  const seqs = (afterSeq: number) =>
    map.follow(k1, afterSeq).replay.map((e) => e.eventId);

  assert.deepEqual(seqs(0), ["e-a", "e-b"]);
  assert.deepEqual(seqs(a.seq), ["e-b"]);
  map.unfollow(k1);
  assert.deepEqual(seqs(a.seq), ["e-b"]);
  map.dispose(k1);
  map.bind(k1, pi);
  assert.deepEqual(seqs(a.seq), ["e-b"]);
  assert.deepEqual(seqs(b.seq), []);
  assert.deepEqual(map.follow(k2, 0).replay, []);
  assert.throws(() => map.follow(k1, b.seq + 100), code("INVALID_CURSOR"));
  store.close();
});

test("follow re-resolves grants at replay time: a revoked reference fails closed with no history and no snapshot", () => {
  const { store, pi } = setup();
  let allow = true;
  const map = new SessionMap(store, {
    ...context,
    resolveReference: () => allow,
  });
  map.bind(k1, pi);
  const id = pi.getSessionId();
  map.anchorRun(id, run("run-1"));
  const [d1, delta] = fixture.engineEvents;
  const one = map.publish(id, d1).event;
  map.publish(id, delta);
  allow = false;
  assert.throws(() => map.follow(k1, 0), code("EVENT_SOURCE"));
  assert.throws(() => map.follow(k1, 0), code("EVENT_SOURCE"));
  // Nothing was committed on the denied path: no snapshot seq was consumed.
  assert.equal(store.eventCursor("w-demo", "s1"), 1);
  allow = true;
  const [snapshot, ...rest] = map.follow(k1, 0).replay;
  assert.equal(snapshot!.kind, "run.reconnect_snapshot");
  assert.equal(snapshot!.seq, 3);
  assert.deepEqual(rest, [one]);
  store.close();
});

test("gap replay order drives the real renderer reducer to the complete state", async () => {
  const { createTurnStreamTransport } =
    await import("../../apps/desktop/src/stores/turns.ts");
  const { store, pi, map } = setup();
  map.bind(k1, pi);
  const id = pi.getSessionId();
  map.anchorRun(id, run("run-1"));
  const [d1, delta] = fixture.engineEvents;
  map.publish(id, d1);
  map.publish(id, delta);
  map.publish(id, {
    ...durableEvent("evt-3"),
    payload: { runId: "run-3", turnId: "turn-3" },
  });
  const { replay } = map.follow(k1, 0);
  const transport = createTurnStreamTransport({
    sessionId: "s1",
    scopeId: "w-demo",
    schedule: () => {},
  });
  for (const event of replay) transport.enqueue(event);
  const state = transport.flush();
  assert.equal(state.needsResync, false);
  assert.equal(state.duplicateCount, 0);
  assert.equal(state.protocolErrors, 0);
  assert.equal(state.lastDurableSeq, 3);
  assert.deepEqual(Object.keys(state.runs).sort(), ["run-1", "run-3"]);
  assert.equal(state.runs["run-1"]!.turnId, "turn-1");
  assert.equal(state.runs["run-3"]!.turnId, "turn-3");
  store.close();
});

test("a trailing lost transient is detected after reopen by a fresh SessionMap", () => {
  const { dir, store, pi, map } = setup();
  map.bind(k1, pi);
  const id = pi.getSessionId();
  map.anchorRun(id, run("run-1"));
  const [d1, delta] = fixture.engineEvents;
  const one = map.publish(id, d1).event;
  assert.equal(map.publish(id, delta).event.seq, 2);
  const file = pi.getSessionFile()!;
  store.close();

  const reopened = Store.open(join(dir, "store.db"));
  const fresh = new SessionMap(reopened, context);
  fresh.bind(k1, SessionManager.open(file, join(dir, "pi")));
  const replay = fresh.follow(k1, one.seq).replay;
  assert.equal(replay.length, 1);
  const [snapshot] = replay;
  assert.equal(snapshot!.kind, "run.reconnect_snapshot");
  assert.equal(snapshot!.seq, 3);
  assert.deepEqual(snapshot!.payload, {
    runId: "run-1",
    lastDurableSeq: 1,
    activeActionIds: [],
    state: "ready",
  });
  // Committed, not synthesized: it replays from the Store.
  assert.deepEqual(reopened.replayEvents("w-demo", "s1", 2), [snapshot]);
  reopened.close();
});

test("follow re-resolves payload references from the event schema: a revoked payload ref fails closed", () => {
  const { store, pi } = setup();
  const denied = new Set<string>();
  const map = new SessionMap(store, {
    ...context,
    resolveReference: (id: string) => !denied.has(id),
  });
  map.bind(k1, pi);
  const id = pi.getSessionId();
  map.anchorRun(id, run("run-1"));
  const started = map.publish(id, fixture.engineEvents[0]).event;
  const intent = map.publish(id, {
    ...fixture.engineEvents[0],
    eventId: "evt-intent",
    kind: "turn.tool_intent",
    payload: {
      runId: "run-2",
      actionId: "act-1",
      capabilityId: "cap-1",
      target: "target-1",
      argsSummary: "args",
    },
  }).event;
  const before = store.eventCursor("w-demo", "s1");

  // The source record stays granted; only a payload ref is revoked.
  for (const revoked of ["run-1", "act-1", "cap-1"]) {
    denied.add(revoked);
    assert.ok(!denied.has("rec-run-1"));
    assert.throws(() => map.follow(k1, 0), code("EVENT_SOURCE"), revoked);
    denied.delete(revoked);
  }
  assert.equal(store.eventCursor("w-demo", "s1"), before);
  assert.deepEqual(map.follow(k1, 0).replay, [started, intent]);
  store.close();
});

test("repeated resubscribe through SessionMap -> bridge -> turns completes recovery every cycle", async () => {
  const { createTurnStreamTransport, resyncRequest } =
    await import("../../apps/desktop/src/stores/turns.ts");
  const { store, pi, map } = setup();
  map.bind(k1, pi);
  const id = pi.getSessionId();
  map.anchorRun(id, run("run-1"));
  const [d1, delta] = fixture.engineEvents;
  map.publish(id, d1);
  map.publish(id, delta);
  const three = map.publish(id, {
    ...durableEvent("evt-3"),
    payload: { runId: "run-3", turnId: "turn-3" },
  }).event;

  const resyncs: number[] = [];
  const transport = createTurnStreamTransport({
    sessionId: "s1",
    scopeId: "w-demo",
    schedule: () => {},
    onResync: (fromSeq) => resyncs.push(fromSeq),
  });

  // Initial subscribe: the committed replay (led by its snapshot) lands with
  // no gap and no protocol error.
  for (const event of map.follow(k1, 0).replay) transport.enqueue(event);
  let state = transport.flush();
  assert.equal(state.needsResync, false);
  assert.equal(state.protocolErrors, 0);
  assert.equal(state.lastDurableSeq, three.seq);

  // Two full control -> resubscribe cycles: the retained contiguous history
  // completes recovery without waiting for a snapshot, and redelivered
  // duplicates never move a cursor (the Codex deadlock repro, end to end).
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    transport.enqueue({
      frame: "control",
      kind: "stream.resync",
      sessionId: "s1",
      fromSeq: 0,
    } as never);
    assert.equal(transport.current().needsResync, true);
    assert.deepEqual(resyncRequest(transport.current()), { afterSeq: 0 });
    const { channel, replay } = map.follow(k1, 0);
    // B2: the bridge re-arms overflow resyncs at the follower's cursor.
    assert.equal(channel.bridge.clientAppliedSeq, 0);
    for (const event of replay) transport.enqueue(event);
    state = transport.flush();
    assert.equal(state.needsResync, false);
    assert.equal(state.resyncCount, cycle);
    assert.equal(state.lastDurableSeq, three.seq);
    assert.equal(state.protocolErrors, 0);
  }
  assert.deepEqual(resyncs, [0, 0]);

  // Third cycle at the engine's highwater: a new event plus the resumed
  // cursor completes recovery and re-arms the bridge at the applied cursor.
  transport.enqueue({
    frame: "control",
    kind: "stream.resync",
    sessionId: "s1",
    fromSeq: three.seq,
  } as never);
  assert.deepEqual(resyncs, [0, 0, three.seq]);
  const four = map.publish(id, {
    ...durableEvent("evt-4"),
    payload: { runId: "run-4", turnId: "turn-4" },
  }).event;
  const { channel, replay } = map.follow(k1, three.seq);
  assert.equal(channel.bridge.clientAppliedSeq, three.seq);
  // Earlier ledger snapshots may ride along; the new event must be there.
  assert.equal(replay.at(-1)!.eventId, "evt-4");
  for (const event of replay) transport.enqueue(event);
  state = transport.flush();
  assert.equal(state.needsResync, false);
  assert.equal(state.resyncCount, 3);
  assert.equal(state.lastDurableSeq, four.seq);
  store.close();
});

test("interleaved two-session cursors stay isolated across bridge and transport", async () => {
  const { createTurnStreamTransport } =
    await import("../../apps/desktop/src/stores/turns.ts");
  const { dir, store, pi, map } = setup();
  const pi2 = SessionManager.create(dir, join(dir, "pi"));
  map.bind(k1, pi);
  map.bind(k2, pi2);
  const id1 = pi.getSessionId();
  const id2 = pi2.getSessionId();
  map.anchorRun(id1, run("run-1"));
  map.anchorRun(id2, run("run-2"));

  // Interleave the two sessions' publishes: s1 holds three durable events,
  // s2 holds two — their cursors must never bleed into each other.
  const a1 = map.publish(id1, {
    ...durableEvent("evt-a1"),
    payload: { runId: "run-1", turnId: "turn-a1" },
  }).event;
  const b1 = map.publish(id2, {
    ...durableEvent("evt-b1"),
    payload: { runId: "run-2", turnId: "turn-b1" },
  }).event;
  const a2 = map.publish(id1, {
    ...durableEvent("evt-a2"),
    payload: { runId: "run-1", turnId: "turn-a2" },
  }).event;
  const b2 = map.publish(id2, {
    ...durableEvent("evt-b2"),
    payload: { runId: "run-2", turnId: "turn-b2" },
  }).event;
  const a3 = map.publish(id1, {
    ...durableEvent("evt-a3"),
    payload: { runId: "run-1", turnId: "turn-a3" },
  }).event;
  assert.equal(a1.sessionId, "s1");
  assert.equal(b1.sessionId, "s2");
  assert.equal(a3.seq, 3);
  assert.equal(b2.seq, 2);

  const resyncs1: number[] = [];
  const resyncs2: number[] = [];
  const t1 = createTurnStreamTransport({
    sessionId: "s1",
    scopeId: "w-demo",
    schedule: () => {},
    onResync: (fromSeq) => resyncs1.push(fromSeq),
  });
  const t2 = createTurnStreamTransport({
    sessionId: "s2",
    scopeId: "w-demo",
    schedule: () => {},
    onResync: (fromSeq) => resyncs2.push(fromSeq),
  });
  const first1 = map.follow(k1, 0);
  const first2 = map.follow(k2, 0);
  for (const event of first1.replay) t1.enqueue(event);
  for (const event of first2.replay) t2.enqueue(event);
  const state1 = t1.flush();
  const state2 = t2.flush();
  assert.equal(state1.lastDurableSeq, a3.seq);
  assert.equal(state2.lastDurableSeq, b2.seq);
  assert.deepEqual(Object.keys(state1.runs).sort(), ["run-1"]);
  assert.deepEqual(Object.keys(state2.runs).sort(), ["run-2"]);

  // A control for s1 clamps to s1's cursor and never wakes s2's transport.
  t1.enqueue({
    frame: "control",
    kind: "stream.resync",
    sessionId: "s1",
    fromSeq: 99,
  } as never);
  assert.deepEqual(resyncs1, [a3.seq]);
  assert.equal(t1.current().needsResync, true);
  assert.deepEqual(resyncs2, []);
  assert.equal(t2.current().needsResync, false);
  assert.equal(t2.current().protocolErrors, 0);
  assert.equal(t2.current().lastDurableSeq, b2.seq);

  // Each session's bridge re-arms at its own applied cursor (B2, isolated).
  assert.equal(map.follow(k1, a3.seq).channel.bridge.clientAppliedSeq, 3);
  assert.equal(map.follow(k2, b2.seq).channel.bridge.clientAppliedSeq, 2);
  store.close();
});
