// TD-14 — the revision fence supplies NativePolicy's current authority.
// Real SQLite store and the real NativePolicy; the only stand-in is the
// config-revision input port (swap for TD-26's ConfigAuthority when it lands).

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RevisionFence } from "../packages/splyce-pi/dist/admission.js";
import {
  NativePolicy,
  actionArgumentsDigest,
} from "../packages/splyce-pi/dist/policy.js";
import { Store } from "../packages/splyce-pi/dist/store.js";

const records = JSON.parse(
  await readFile(
    new URL("./fixtures/contracts/records.json", import.meta.url),
    "utf8",
  ),
);

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "splyce-fence-"));
  const store = Store.open(join(dir, "store.db"));
  t.after(async () => {
    if (!store.closed) store.close();
    await rm(dir, { recursive: true, force: true });
  });
  const refs = new Set([
    "s1",
    "b1",
    "w-demo",
    "snapshot1",
    "e1",
    "grant1",
    "p1",
    "binding1",
    "cap1",
    "args1",
  ]);
  const caller = {
    sessionId: "s1",
    configRevision: "cfg1",
    profileRevision: "profile1",
    policyRevision: "policy1",
    resolveReference: (id, scope) =>
      scope === "w-demo" &&
      (refs.has(id) ||
        store
          .list(scope)
          .records.some(
            ({ record }) =>
              record.recordId === id ||
              record.runId === id ||
              record.actionId === id,
          )),
  };
  store.append({ kind: "run", record: records.run }, caller);
  const ownership = store.acquireWorkspace("w-demo", "s1");
  let config = "cfg1";
  const source = { effectiveRevision: () => config };
  const fence = new RevisionFence(source, {
    scopeId: "w-demo",
    profileRevision: "profile1",
    policyRevision: "policy1",
    grantIds: ["grant1"],
  });
  const args = { text: "changed" };
  const permit = {
    toolCallId: "call-1",
    toolName: "fixture_write",
    actionId: "a1",
    runRecordId: "rec-run",
    grantId: "grant1",
    parentActionId: null,
    capabilityId: "cap1",
    capabilityVersion: "1",
    argumentsArtifactId: "args1",
    argumentsDigest: actionArgumentsDigest(args),
    targetScopeId: "w-demo",
    idempotencyKey: "effect-1",
    ownership,
  };
  const states = () =>
    store
      .list("w-demo")
      .records.filter(({ kind }) => kind === "action")
      .map(({ record }) => record.state);
  return {
    store,
    caller,
    ownership,
    fence,
    args,
    permit,
    states,
    setConfig: (v) => (config = v),
  };
}

const run = (policy, permit, args, calls) =>
  policy.execute(
    permit.toolCallId,
    permit.toolName,
    args,
    async () => {
      calls.n += 1;
      return { isError: false };
    },
    undefined,
  );

test("current() is a frozen snapshot that follows the committed config revision", async (t) => {
  const f = await fixture(t);
  const first = f.fence.current();
  assert.equal(first.configRevision, "cfg1");
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.grantIds));
  f.setConfig("cfg2");
  assert.equal(f.fence.current().configRevision, "cfg2");
  assert.equal(
    first.configRevision,
    "cfg1",
    "an earlier snapshot never changes",
  );
  assert.throws(() => first.grantIds.push("x"));
});

test("a grant withdrawn before dispatch blocks the effect and records a denial", async (t) => {
  const f = await fixture(t);
  const policy = new NativePolicy(f.store, f.caller, f.fence.current);
  policy.authorize(f.permit);
  f.fence.revokeGrant("grant1");
  const calls = { n: 0 };
  await assert.rejects(run(policy, f.permit, f.args, calls), {
    code: "POLICY_DENIED",
  });
  assert.equal(calls.n, 0, "the tool was never invoked");
  assert.deepEqual(f.states(), ["denied"]);
});

test("a withdrawal racing the final handoff check still blocks the new effect", async (t) => {
  const f = await fixture(t);
  let n = 0;
  // The first check passes on a snapshot taken before the withdrawal; the
  // withdrawal lands before the second (post-intent, pre-invoke) check.
  const racing = () => {
    n += 1;
    const snapshot = f.fence.current();
    if (n === 1) f.fence.revokeGrant("grant1");
    return snapshot;
  };
  const policy = new NativePolicy(f.store, f.caller, racing);
  policy.authorize(f.permit);
  const calls = { n: 0 };
  await assert.rejects(run(policy, f.permit, f.args, calls), {
    code: "POLICY_DENIED",
  });
  assert.equal(calls.n, 0, "the effect did not run");
  assert.ok(f.states().includes("denied"));
  assert.ok(!f.states().includes("completed"));
});

test("a committed config change makes callers built on the old revision deny", async (t) => {
  const f = await fixture(t);
  const policy = new NativePolicy(f.store, f.caller, f.fence.current);
  policy.authorize(f.permit);
  f.setConfig("cfg2");
  const calls = { n: 0 };
  await assert.rejects(run(policy, f.permit, f.args, calls), {
    code: "POLICY_DENIED",
  });
  assert.equal(calls.n, 0);
});

test("queued work re-checks the revisions it was queued under", async (t) => {
  const f = await fixture(t);
  const queued = f.fence.revisions();
  f.fence.assertCurrent(queued);
  f.setConfig("cfg2");
  assert.throws(() => f.fence.assertCurrent(queued), {
    code: "STALE_REVISION",
  });
  const requeued = f.fence.revisions();
  f.fence.assertCurrent(requeued);
  f.fence.setProfileRevision("profile2");
  assert.throws(() => f.fence.assertCurrent(requeued), {
    code: "STALE_REVISION",
  });
  const afterProfile = f.fence.revisions();
  f.fence.setPolicyRevision("policy2");
  assert.throws(() => f.fence.assertCurrent(afterProfile), {
    code: "STALE_REVISION",
  });
  f.fence.setPlanMode(true);
  assert.throws(() => f.fence.assertCurrent(f.fence.revisions()), {
    code: "STALE_REVISION",
  });
});

test("a stale workspace epoch is rejected even after a valid handoff", async (t) => {
  const f = await fixture(t);
  f.store.releaseWorkspace("w-demo", "s1", f.ownership.epoch);
  const next = f.store.acquireWorkspace("w-demo", "s1");
  assert.ok(next.epoch > f.ownership.epoch);
  const policy = new NativePolicy(f.store, f.caller, f.fence.current);
  policy.authorize(f.permit);
  const calls = { n: 0 };
  await assert.rejects(run(policy, f.permit, f.args, calls), {
    code: "STALE_OWNERSHIP",
  });
  assert.equal(calls.n, 0);
});

test("with the grant intact and revisions current the effect runs once", async (t) => {
  const f = await fixture(t);
  const policy = new NativePolicy(f.store, f.caller, f.fence.current);
  policy.authorize(f.permit);
  const calls = { n: 0 };
  await run(policy, f.permit, f.args, calls);
  assert.equal(calls.n, 1);
  assert.ok(f.states().includes("completed"));
});
