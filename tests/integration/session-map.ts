// TD-10 / C1_session_catalog — Pi session ↔ native (scopeId, sessionId) map,
// Pi-derived ancestry across fork/resume, one channel per session and
// native-owned event identity, on a real Store and real Pi SessionManagers.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { SessionMap } from "../../packages/splyce-pi/dist/session-map.js";
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
const converse = (pi: SessionManager, text: string) => {
  pi.appendMessage({ role: "user", content: text, timestamp: Date.now() });
  pi.appendMessage({
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

test("fork ancestry is Pi-derived, survives resume and never duplicates anchors", () => {
  const { dir, store, pi: parent, map } = setup();
  const parentLast = parent.getLeafId();
  const child = SessionManager.forkFrom(
    parent.getSessionFile()!,
    dir,
    join(dir, "pi"),
  );
  // Child bound before its parent: the missing node is unresolved, not invented.
  map.bind(k2, child);
  const orphan = map.ancestry(child.getSessionId());
  assert.equal(orphan.complete, false);
  assert.equal(orphan.chain.length, 1);
  assert.equal(orphan.chain[0]!.anchor.forkPointEntryId, null);

  map.bind(k1, parent);
  const forked = map.ancestry(child.getSessionId());
  assert.equal(forked.complete, true);
  assert.deepEqual(
    forked.chain.map((n) => [n.piSessionId, n.scopeId, n.sessionId]),
    [
      [child.getSessionId(), "w-demo", "s2"],
      [parent.getSessionId(), "w-demo", "s1"],
    ],
  );
  assert.equal(forked.chain[0]!.anchor.forkPointEntryId, parentLast);
  assert.equal(forked.chain[0]!.anchor.firstChildEntryId, null);
  assert.equal(forked.chain[1]!.anchor.forkPointEntryId, null);

  // The first child entry resolves only once Pi actually has one.
  converse(child, "child turn");
  const resolved = map.ancestry(child.getSessionId());
  const firstChild = child
    .getEntries()
    .find((e) => parent.getEntry(e.id) === undefined)!.id;
  assert.equal(resolved.chain[0]!.anchor.firstChildEntryId, firstChild);

  const anchored = map.anchorRun(child.getSessionId(), run("r-fork"));
  assert.deepEqual(
    map.anchorRun(child.getSessionId(), run("r-fork")),
    anchored,
  );

  // Resume: a new process reopens the store and Pi files.
  const childFile = child.getSessionFile()!;
  const parentFile = parent.getSessionFile()!;
  store.close();
  const reopened = Store.open(join(dir, "store.db"));
  const resumed = new SessionMap(reopened, context);
  const child2 = SessionManager.open(childFile, join(dir, "pi"));
  resumed.bind(k2, child2);
  resumed.bind(k1, SessionManager.open(parentFile, join(dir, "pi")));
  assert.deepEqual(resumed.ancestry(child2.getSessionId()), resolved);
  assert.deepEqual(
    resumed.anchorRun(child2.getSessionId(), run("r-fork")),
    anchored,
  );
  const runs = reopened
    .list("w-demo", 0, "s2")
    .records.filter((r: { kind: string }) => r.kind === "run");
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.record.piSessionId, child.getSessionId());
  assert.equal(
    runs[0]!.record.branchAnchorId,
    resolved.chain[0]!.anchor.branchAnchorId,
  );
  reopened.close();
});

test("one channel per (scope, session), disposed with the session", () => {
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

  map.dispose(k1);
  assert.throws(() => map.follow(k1, 0), code("SESSION_UNKNOWN"));
  assert.throws(() => map.resolve(pi.getSessionId()), code("SESSION_UNKNOWN"));
  assert.equal(map.follow(k2, 0).channel, b);
  map.bind(k1, pi);
  assert.notEqual(map.follow(k1, 0).channel, a);
  store.close();
});

test("published events carry the native scope/session; engine identity is rejected", () => {
  const { store, pi, map } = setup();
  map.bind(k1, pi);
  const id = pi.getSessionId();
  // Not followed: the renderer replays durable records by afterSeq instead.
  assert.throws(
    () => map.publish(id, fixture.engineEvents[0]),
    code("SESSION_NOT_FOLLOWED"),
  );
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

test("resubscribe continues the session cursor without gaps or foreign records", () => {
  const { dir, store, pi, map } = setup();
  const pi2 = SessionManager.create(dir, join(dir, "pi"));
  map.bind(k1, pi);
  map.bind(k2, pi2);
  const a = map.anchorRun(pi.getSessionId(), run("r-a"));
  map.anchorRun(pi2.getSessionId(), run("r-other"));
  const b = map.anchorRun(pi.getSessionId(), run("r-b"));
  const seqs = (r: { replay: { records: { seq: number }[] } }) =>
    r.replay.records.map((x) => x.seq);

  assert.deepEqual(seqs(map.follow(k1, 0)), [a.seq, b.seq]);
  assert.deepEqual(seqs(map.follow(k1, a.seq)), [b.seq]);
  map.dispose(k1);
  map.bind(k1, pi);
  assert.deepEqual(seqs(map.follow(k1, a.seq)), [b.seq]);
  assert.deepEqual(seqs(map.follow(k1, b.seq)), []);
  assert.throws(
    () => map.follow(k1, b.seq + 100),
    code("CONTRACT_INVALID_CURSOR"),
  );
  store.close();
});
