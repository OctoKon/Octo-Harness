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
  const { channel } = map.follow(k1, 0);
  for (const event of fixture.engineEvents) map.publish(id, event);
  assert.throws(
    () => map.publish(id, fixture.foreignEvent),
    code("SESSION_FOREIGN"),
  );
  const { sessionId, scopeId, ...unscoped } = fixture.foreignEvent;
  assert.throws(
    () => map.publish(id, { ...unscoped, sessionId }),
    code("SESSION_FOREIGN"),
  );
  assert.throws(
    () => map.publish(id, { ...unscoped, scopeId: "w-demo" }),
    code("SESSION_FOREIGN"),
  );
  const frames = channel.bridge.drain().frames;
  assert.deepEqual(
    frames.map((f: { event: Record<string, unknown> }) => [
      f.event.eventId,
      f.event.scopeId,
      f.event.sessionId,
    ]),
    [
      ["evt-1", "w-demo", "s1"],
      ["evt-2", "w-demo", "s1"],
    ],
  );
  store.close();
});

test("without a follower publish never throws for valid events and durable commits replay later", () => {
  const { store, pi, map } = setup();
  map.bind(k1, pi);
  const id = pi.getSessionId();
  // Durable commit happens with nobody following.
  const committed = map.anchorRun(id, run("r-offline"));
  for (const event of fixture.engineEvents)
    assert.equal(map.publish(id, event), undefined);
  // Validation still runs first: an invalid event fails even unfollowed.
  const [durable] = fixture.engineEvents;
  assert.throws(
    () => map.publish(id, { ...durable, kind: "unknown.kind" }),
    (e: unknown) =>
      String((e as { code?: string }).code).startsWith("CONTRACT_"),
  );
  assert.throws(
    () => map.publish(id, { ...durable, durable: false }),
    (e: unknown) =>
      String((e as { code?: string }).code).startsWith("CONTRACT_"),
  );
  // A later follower gets the durable record by replay; the discarded
  // transient delta is not queued on its fresh bridge.
  const { channel, replay } = map.follow(k1, 0);
  assert.ok(
    (replay.records as Stored[]).some(
      (r) => r.seq === committed.seq && r.record.runId === "r-offline",
    ),
  );
  assert.equal(channel.bridge.status().pendingFrames, 0);
  store.close();
});

test("resubscribe continues the session cursor without gaps or foreign records", () => {
  const { dir, store, pi, map } = setup();
  const pi2 = SessionManager.create(dir, join(dir, "pi"));
  map.bind(k1, pi);
  map.bind(k2, pi2);
  const a = map.anchorRun(pi.getSessionId(), run("r-a"));
  map.anchorRun(pi2.getSessionId(), run("r-other"));
  const b = map.anchorRun(pi.getSessionId(), run("r-b"));
  const own = (afterSeq: number) =>
    (store.list("w-demo", afterSeq, "s1").records as Stored[]).map(
      (r) => r.seq,
    );
  const seqs = (r: { replay: { records: { seq: number }[] } }) =>
    r.replay.records.map((x) => x.seq);

  assert.ok(own(0).includes(a.seq) && own(0).includes(b.seq));
  assert.deepEqual(seqs(map.follow(k1, 0)), own(0));
  assert.deepEqual(seqs(map.follow(k1, a.seq)), own(a.seq));
  assert.ok(own(a.seq).includes(b.seq));
  map.unfollow(k1);
  assert.deepEqual(seqs(map.follow(k1, a.seq)), own(a.seq));
  map.dispose(k1);
  map.bind(k1, pi);
  assert.deepEqual(seqs(map.follow(k1, a.seq)), own(a.seq));
  const last = own(0).at(-1)!;
  assert.deepEqual(seqs(map.follow(k1, last)), []);
  assert.throws(
    () => map.follow(k1, last + 100),
    code("CONTRACT_INVALID_CURSOR"),
  );
  store.close();
});
