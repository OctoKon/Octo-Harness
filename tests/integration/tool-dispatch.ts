// Splyce tool dispatch (C2_tool_dispatch): workspace tools and agent context
// tools driven through the REAL Store and NativePolicy via the Pi admission
// sequence (reserve -> prepare -> finish -> execute). Only the host ports are
// injected: approval, native redaction, native directory identity.
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  NativePolicy,
  actionArgumentsDigest,
} from "../../packages/splyce-pi/dist/policy.js";
import { Store } from "../../packages/splyce-pi/dist/store.js";
import {
  createToolDispatch,
  type ApprovalRequest,
  type ToolAdmission,
} from "../../packages/splyce-pi/dist/tool-dispatch.js";
import {
  IDENTITY,
  MemoryWorkspaceIdentity,
} from "../fixtures/native-grants.mjs";

const records = JSON.parse(
  readFileSync(
    new URL("../fixtures/contracts/records.json", import.meta.url),
    "utf8",
  ),
);
const caller = {
  sessionId: "pi-1",
  configRevision: "cfg1",
  profileRevision: "profile1",
  policyRevision: "policy1",
  resolveReference: () => true,
};
const SECRET = "sk-live1234567890abcdef";

type Options = {
  approve?: (r: ApprovalRequest) => boolean;
  nativeRedact?: (text: string) => Promise<string | { text: string }>;
  memory?: { capture(scopeId: string, sessionId: string): unknown[] };
};

async function setup(t: { after(fn: () => void): void }, options: Options = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "td-dispatch-")));
  const store = Store.open(join(dir, "store.db"));
  t.after(() => {
    if (!store.closed) store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const workDir = join(dir, "ws");
  mkdirSync(workDir);
  writeFileSync(join(workDir, "hello.txt"), `hello ${SECRET}\n`);
  const workspace = store.admitWorkspace(
    { canonicalPath: workDir, ...IDENTITY },
    caller,
  );
  const workspaceId = workspace.workspaceId;
  store.append(
    {
      kind: "branchAnchor",
      record: {
        ...records.branchAnchor,
        scopeId: workspaceId,
        piSessionId: caller.sessionId,
      },
    },
    caller,
  );
  const identity = new MemoryWorkspaceIdentity();
  identity.set(workspaceId, IDENTITY);
  const live = new Set<string>();
  let run = {
    ...records.run,
    piSessionId: caller.sessionId,
    workspaceId,
    grantIds: [] as string[],
  };
  const ownership = store.acquireWorkspace(workspaceId, caller.sessionId);
  let revision = 0;
  const attachGrant = (grantId: string) => {
    live.add(grantId);
    revision += 1;
    run = {
      ...run,
      recordId: `rec-run-${String(revision)}`,
      grantIds: [...run.grantIds, grantId],
    };
    store.append({ kind: "run", record: run }, caller);
  };
  // the run record must exist before the first permit
  store.append({ kind: "run", record: run }, caller);
  const readGrant = store.mintGrant(
    {
      workspaceId,
      sessionId: caller.sessionId,
      capability: "fs.read",
      scope: "session",
    },
    caller,
  ).grantId;
  attachGrant(readGrant);
  const policy = new NativePolicy(
    store,
    caller,
    () => ({
      configRevision: "cfg1",
      profileRevision: "profile1",
      policyRevision: "policy1",
      grantIds: [...live],
      planMode: false,
    }),
    identity,
  );
  const approvals: ApprovalRequest[] = [];
  const bound: object[] = [];
  const dispatch = createToolDispatch({
    store,
    policy,
    caller,
    scopeId: records.run.scopeId,
    workspaceId,
    runId: run.runId,
    runRecordId: run.recordId,
    ownership,
    readGrantId: readGrant,
    attachGrant,
    approve: async (r) => {
      approvals.push(r);
      return (options.approve ?? (() => true))(r);
    },
    redact: (text) => text.split(SECRET).join("[LIVE]"),
    nativeRedact:
      options.nativeRedact ?? (async (text) => ({ text, redactedCount: 0 }) as never),
    bindTool: (tool) => {
      bound.push(tool);
      return () => undefined;
    },
    ...(options.memory
      ? {
          context: {
            index: { root: workDir },
            codeTools: [],
            memory: options.memory as never,
            scopeId: records.run.scopeId,
          },
        }
      : {}),
  });
  /** The Pi loop's sequence around the ORIGINAL tool.execute. */
  async function drive(
    toolCallId: string,
    name: string,
    args: Record<string, unknown>,
    tamper?: Record<string, unknown>,
  ) {
    const adm: ToolAdmission = dispatch.admission;
    const tool = dispatch.tools.find((x) => x.name === name)!;
    adm.reserve(toolCallId, name, undefined);
    await adm.prepare(toolCallId, name, args, undefined, undefined);
    adm.finish(toolCallId, name, tamper ?? args, undefined);
    return adm.execute(
      toolCallId,
      name,
      tamper ?? args,
      async (admitted) => {
        const result = await tool.execute(
          toolCallId,
          admitted as Record<string, unknown>,
        );
        return { result, isError: result.isError === true, durationMs: 1 };
      },
      undefined,
    );
  }
  const scope = records.run.scopeId as string;
  const actions = (actionId: string) =>
    store
      .list(scope)
      .records.filter(
        ({ kind, record }) =>
          kind === "action" &&
          (record as { actionId: string }).actionId === actionId,
      );
  const events = () => store.replayEvents(scope, caller.sessionId);
  const grants = () =>
    store.list(workspaceId).records.filter(({ kind }) => kind === "grant");
  return {
    store,
    policy,
    dispatch,
    drive,
    actions,
    events,
    grants,
    workDir,
    approvals,
    bound,
    workspaceId,
    scope,
  };
}

const state = (r: { record: unknown }) => (r.record as { state: string }).state;
const rejects = (code: string) => (error: unknown) =>
  (error as { code?: string }).code === code;

test("write needs approval: denied call runs nothing and leaves a denied receipt", async (t) => {
  const f = await setup(t, { approve: () => false });
  await assert.rejects(
    f.drive("call-1", "write", { path: "a.txt", content: "x" }),
    rejects("POLICY_DENIED"),
  );
  assert.equal(existsSync(join(f.workDir, "a.txt")), false);
  assert.equal(f.approvals.length, 1);
  assert.deepEqual(f.actions("call-1").map(state), ["denied"]);
  assert.equal(
    f.grants().filter(({ record }) => (record as { scope: string }).scope === "once")
      .length,
    0,
  );
  assert.equal(f.events().length, 0);
});

test("approved write: once grant consumed exactly once, one receipt per effect, file written", async (t) => {
  const f = await setup(t);
  const args = { path: "a.txt", content: "payload" };
  const out = await f.drive("call-1", "write", args);
  assert.equal(out.isError, false);
  assert.equal(readFileSync(join(f.workDir, "a.txt"), "utf8"), "payload");
  assert.deepEqual(f.actions("call-1").map(state), [
    "proposed",
    "approved",
    "running",
    "completed",
  ]);
  const once = f
    .grants()
    .map(({ record }) => record as { scope: string; consumedAt?: string; actionId?: string; argumentsDigest?: string });
  assert.equal(once.filter((g) => g.scope === "once" && !g.consumedAt).length, 1);
  assert.equal(once.filter((g) => g.scope === "once" && g.consumedAt).length, 1);
  assert.equal(once.find((g) => g.scope === "once")?.argumentsDigest, actionArgumentsDigest(args));
  const outcomes = f
    .store.list(f.scope)
    .records.filter(
      ({ kind, record }) =>
        kind === "outcome" && (record as { actionId: string }).actionId === "call-1",
    );
  assert.equal(outcomes.length, 1);
  // a second call needs its own approval and its own grant; the first stays consumed
  await f.drive("call-2", "write", { path: "b.txt", content: "two" });
  assert.equal(f.approvals.length, 2);
  assert.equal(
    f.grants().filter(({ record }) => (record as { consumedAt?: string }).consumedAt).length,
    2,
  );
});

test("tool_intent and tool_outcome(+summary) commit in the same batch as the receipts", async (t) => {
  const f = await setup(t);
  await f.drive("call-1", "write", { path: "a.txt", content: "payload" });
  const events = f.events();
  assert.deepEqual(
    events.map((e) => e.kind),
    ["turn.tool_intent", "turn.tool_outcome"],
  );
  const [intent, outcome] = events as [
    { recordId: string; payload: Record<string, unknown> },
    { recordId: string; payload: Record<string, unknown> },
  ];
  const all = f.store.list(f.scope).records;
  const seq = (id: string) => all.find(({ record }) => (record as { recordId: string }).recordId === id)!.seq;
  const actions = f.actions("call-1");
  const running = actions.find((r) => state(r) === "running")!;
  const approved = actions.find((r) => state(r) === "approved")!;
  const completed = actions.find((r) => state(r) === "completed")!;
  const outcomeReceipt = all.find(({ kind }) => kind === "outcome")!;
  assert.equal(intent.recordId, (running.record as { recordId: string }).recordId);
  assert.equal(outcome.recordId, (completed.record as { recordId: string }).recordId);
  // contiguous seqs: approved, running, grant.consumed, intent event / outcome, completed, outcome event
  const intentSeq = seq(`event:${(events[0] as unknown as { eventId: string }).eventId}`);
  assert.ok(intentSeq - approved.seq <= 3 && intentSeq > running.seq);
  const outcomeSeq = seq(`event:${(events[1] as unknown as { eventId: string }).eventId}`);
  assert.ok(outcomeSeq - outcomeReceipt.seq <= 2 && outcomeSeq > completed.seq);
  assert.equal(intent.payload.actionId, "call-1");
  assert.equal(outcome.payload.status, "success");
  const summary = outcome.payload.summary as { bytes: number; truncated: boolean; durationMs: number; preview: string };
  assert.equal(typeof summary.durationMs, "number");
  assert.equal(summary.truncated, false);
  assert.ok(summary.preview.length <= 2048);
});

test("read runs on the session grant with a redacted preview and no receipts besides the action", async (t) => {
  const f = await setup(t);
  const out = await f.drive("call-r", "read", { path: "hello.txt" });
  assert.equal(out.isError, false);
  assert.equal(f.approvals.length, 0);
  assert.equal(f.grants().filter(({ record }) => (record as { scope: string }).scope === "once").length, 0);
  const [, outcome] = f.events() as unknown as { payload: { summary: { preview: string } } }[];
  assert.ok(!JSON.stringify(f.events()).includes(SECRET));
  assert.match(outcome!.payload.summary.preview, /hello/);
});

test("preview redaction fails closed when the native lane rejects", async (t) => {
  const f = await setup(t, {
    nativeRedact: async () => {
      throw new Error("down");
    },
  });
  await f.drive("call-r", "read", { path: "hello.txt" });
  const events = JSON.stringify(f.events());
  assert.ok(!events.includes("hello"));
  assert.ok(!events.includes(SECRET));
  const outcome = f.events()[1] as unknown as { payload: { summary: { preview: string } } };
  assert.equal(outcome.payload.summary.preview, "[unavailable]");
});

test("preview uses the native lane's redacted text", async (t) => {
  const f = await setup(t, {
    nativeRedact: async (text) => ({ text: text.replace(/hello/gu, "NATIVE") }),
  });
  await f.drive("call-r", "read", { path: "hello.txt" });
  const outcome = f.events()[1] as unknown as { payload: { summary: { preview: string } } };
  assert.match(outcome.payload.summary.preview, /NATIVE/);
  assert.ok(!outcome.payload.summary.preview.includes("hello"));
});

test("an argument digest mismatch between prepare and execute is denied and nothing runs", async (t) => {
  const f = await setup(t);
  await assert.rejects(
    f.drive(
      "call-1",
      "write",
      { path: "a.txt", content: "approved" },
      { path: "a.txt", content: "swapped" },
    ),
    rejects("ARGUMENTS_CHANGED"),
  );
  assert.equal(existsSync(join(f.workDir, "a.txt")), false);
  assert.ok(f.actions("call-1").map(state).includes("denied"));
  assert.equal(
    f.store.list(f.scope).records.filter(({ kind }) => kind === "outcome").length,
    0,
  );
});

test("a tool cannot run outside the admission sequence", async (t) => {
  const f = await setup(t);
  const write = f.dispatch.tools.find((x) => x.name === "write")!;
  await assert.rejects(
    write.execute("call-x", { path: "a.txt", content: "x" }),
    rejects("POLICY_DENIED"),
  );
  assert.equal(existsSync(join(f.workDir, "a.txt")), false);
});

test("bind attaches the admission to every session tool and freezes the registry", async (t) => {
  const f = await setup(t);
  const tools = f.dispatch.tools.map((x) => ({ name: x.name }));
  let reloaded = 0;
  const session = {
    agent: { state: { tools } },
    reload: () => {
      reloaded += 1;
    },
    _refreshToolRegistry: () => undefined,
  };
  f.dispatch.bind(session);
  assert.equal(f.bound.length, tools.length);
  assert.throws(() => (session.reload as () => void)(), rejects("TOOL_REGISTRY_FROZEN"));
  assert.throws(
    () => (session._refreshToolRegistry as () => void)(),
    rejects("TOOL_REGISTRY_FROZEN"),
  );
  assert.equal(reloaded, 0);
  assert.throws(
    () =>
      f.dispatch.bind({
        agent: { state: { tools: [{ name: "extension_tool" }] } },
      }),
    rejects("TOOL_REGISTRY_FOREIGN"),
  );
});

test("memory capture runs after a completed turn only and never fails the turn", async (t) => {
  const calls: [string, string][] = [];
  const f = await setup(t, {
    memory: {
      capture(scopeId, sessionId) {
        calls.push([scopeId, sessionId]);
        return [1, 2];
      },
    },
  });
  assert.equal(f.dispatch.onTurnEnd({ state: "failed" }), 0);
  assert.equal(f.dispatch.onTurnEnd({ state: "canceled" }), 0);
  assert.equal(calls.length, 0);
  assert.equal(f.dispatch.onTurnEnd({ state: "completed" }), 2);
  assert.deepEqual(calls, [[f.scope, "pi-1"]]);
  const g = await setup(t, {
    memory: {
      capture() {
        throw new Error("boom");
      },
    },
  });
  assert.equal(g.dispatch.onTurnEnd({ state: "completed" }), 0);
});

test("unknown tool names and nested calls are denied before any permit", async (t) => {
  const f = await setup(t);
  await assert.rejects(
    f.dispatch.admission.prepare("c1", "rm_rf", {}, undefined, undefined),
    rejects("CAPABILITY_REQUIRED"),
  );
  await assert.rejects(
    f.dispatch.admission.prepare("c2", "read", { path: "x" }, "parent", undefined),
    rejects("INVALID_PARENT"),
  );
});

test("an invalid or throwing outcome event never costs the receipts of an effect that ran", async (t) => {
  for (const outcome of [
    () => {
      throw new Error("boom");
    },
    () => ({ kind: "turn.tool_outcome", payload: { bogus: true } }) as never,
  ]) {
    const f = await setup(t);
    const adm = f.dispatch.admission;
    const args = { path: "a.txt", content: "x" };
    adm.reserve("c", "write", undefined);
    await adm.prepare("c", "write", args, undefined, undefined);
    adm.finish("c", "write", args, undefined);
    let ran = 0;
    await f.policy.execute(
      "c",
      "write",
      args,
      async () => {
        ran += 1;
        return { isError: false };
      },
      undefined,
      { outcome },
    );
    assert.equal(ran, 1);
    assert.deepEqual(f.actions("c").map(state), [
      "proposed",
      "approved",
      "running",
      "completed",
    ]);
    assert.equal(
      f.store.list(f.scope).records.filter(({ kind }) => kind === "outcome").length,
      1,
    );
    assert.equal(f.events().length, 0);
  }
});
