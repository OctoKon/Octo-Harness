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
  APPROVAL_ARGS_MAX,
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
  registrationFails?: boolean;
  memory?: { capture(scopeId: string, sessionId: string): unknown[] };
};

async function setup(
  t: { after(fn: () => void): void },
  options: Options = {},
) {
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
  const admissions = new Map<object, ToolAdmission>();
  let registered = 0;
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
    registerNativeProvider: async () => {
      if (options.registrationFails) throw new Error("registration down");
      registered += 1;
    },
    approve: async (r) => {
      approvals.push(r);
      return (options.approve ?? (() => true))(r);
    },
    redact: (text) => text.split(SECRET).join("[LIVE]"),
    nativeRedact:
      options.nativeRedact ??
      (async (text) => ({ text, redactedCount: 0 }) as never),
    bindTool: (tool, admission) => {
      bound.push(tool);
      admissions.set(tool, admission);
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
    before?: (toolCallId: string) => void | Promise<void>,
  ) {
    const adm: ToolAdmission = dispatch.admission;
    const tool = dispatch.tools.find((x) => x.name === name)!;
    adm.reserve(toolCallId, name, undefined);
    await adm.prepare(toolCallId, name, args, undefined, undefined);
    // beforeToolCall: the first point where extension / user code can run.
    try {
      await before?.(toolCallId);
    } catch (error) {
      adm.discard(toolCallId, "denied");
      throw error;
    }
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
    admissions,
    /** What Pi builds from our definitions: name + the parameters object by reference. */
    piTools: () =>
      dispatch.tools.map((x) => ({ name: x.name, parameters: x.parameters })),
    registrations: () => registered,
    workspaceId,
    scope,
  };
}

/** What Pi gets back: the content text and the details summary preview. */
const returned = (out: unknown) => {
  const { result } = out as {
    result: {
      content: { text: string }[];
      details: { summary?: { preview: string } };
    };
  };
  return {
    text: result.content.map((c) => c.text).join(""),
    preview: result.details.summary?.preview ?? "",
  };
};
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
    f
      .grants()
      .filter(({ record }) => (record as { scope: string }).scope === "once")
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
  const once = f.grants().map(
    ({ record }) =>
      record as {
        scope: string;
        consumedAt?: string;
        actionId?: string;
        argumentsDigest?: string;
      },
  );
  assert.equal(
    once.filter((g) => g.scope === "once" && !g.consumedAt).length,
    1,
  );
  assert.equal(
    once.filter((g) => g.scope === "once" && g.consumedAt).length,
    1,
  );
  assert.equal(
    once.find((g) => g.scope === "once")?.argumentsDigest,
    actionArgumentsDigest(args),
  );
  const outcomes = f.store
    .list(f.scope)
    .records.filter(
      ({ kind, record }) =>
        kind === "outcome" &&
        (record as { actionId: string }).actionId === "call-1",
    );
  assert.equal(outcomes.length, 1);
  // a second call needs its own approval and its own grant; the first stays consumed
  await f.drive("call-2", "write", { path: "b.txt", content: "two" });
  assert.equal(f.approvals.length, 2);
  assert.equal(
    f
      .grants()
      .filter(({ record }) => (record as { consumedAt?: string }).consumedAt)
      .length,
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
  const seq = (id: string) =>
    all.find(({ record }) => (record as { recordId: string }).recordId === id)!
      .seq;
  const actions = f.actions("call-1");
  const running = actions.find((r) => state(r) === "running")!;
  const approved = actions.find((r) => state(r) === "approved")!;
  const completed = actions.find((r) => state(r) === "completed")!;
  const outcomeReceipt = all.find(({ kind }) => kind === "outcome")!;
  assert.equal(
    intent.recordId,
    (running.record as { recordId: string }).recordId,
  );
  assert.equal(
    outcome.recordId,
    (completed.record as { recordId: string }).recordId,
  );
  // contiguous seqs: approved, running, grant.consumed, intent event / outcome, completed, outcome event
  const intentSeq = seq(
    `event:${(events[0] as unknown as { eventId: string }).eventId}`,
  );
  assert.ok(intentSeq - approved.seq <= 3 && intentSeq > running.seq);
  const outcomeSeq = seq(
    `event:${(events[1] as unknown as { eventId: string }).eventId}`,
  );
  assert.ok(outcomeSeq - outcomeReceipt.seq <= 2 && outcomeSeq > completed.seq);
  assert.equal(intent.payload.actionId, "call-1");
  assert.equal(outcome.payload.status, "success");
  const summary = outcome.payload.summary as {
    bytes: number;
    truncated: boolean;
    durationMs: number;
    preview: string;
  };
  assert.equal(typeof summary.durationMs, "number");
  assert.equal(summary.truncated, false);
  assert.ok(summary.preview.length <= 2048);
});

test("read runs on the session grant with a redacted preview and no receipts besides the action", async (t) => {
  const f = await setup(t);
  const out = await f.drive("call-r", "read", { path: "hello.txt" });
  assert.equal(out.isError, false);
  assert.equal(f.approvals.length, 0);
  assert.equal(
    f
      .grants()
      .filter(({ record }) => (record as { scope: string }).scope === "once")
      .length,
    0,
  );
  const [, outcome] = f.events() as unknown as {
    payload: { summary: { preview: string } };
  }[];
  assert.ok(!JSON.stringify(f.events()).includes(SECRET));
  assert.match(outcome!.payload.summary.preview, /hello/);
});

test("preview redaction fails closed when the native lane rejects", async (t) => {
  const f = await setup(t, {
    nativeRedact: async () => {
      throw new Error("down");
    },
  });
  const out = await f.drive("call-r", "read", { path: "hello.txt" });
  assert.equal(returned(out).text, "[unavailable]");
  assert.equal(returned(out).preview, "[unavailable]");
  const events = JSON.stringify(f.events());
  assert.ok(!events.includes("hello"));
  assert.ok(!events.includes(SECRET));
  const outcome = f.events()[1] as unknown as {
    payload: { summary: { preview: string } };
  };
  assert.equal(outcome.payload.summary.preview, "[unavailable]");
});

test("preview uses the native lane's redacted text", async (t) => {
  const f = await setup(t, {
    nativeRedact: async (text) => ({ text: text.replace(/hello/gu, "NATIVE") }),
  });
  await f.drive("call-r", "read", { path: "hello.txt" });
  const outcome = f.events()[1] as unknown as {
    payload: { summary: { preview: string } };
  };
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
    f.store.list(f.scope).records.filter(({ kind }) => kind === "outcome")
      .length,
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
  const tools = f.piTools();
  let reloaded = 0;
  const session = {
    agent: { state: { tools } },
    reload: () => {
      reloaded += 1;
    },
    _refreshToolRegistry: () => undefined,
  };
  await f.dispatch.bind(session);
  assert.equal(f.registrations(), 1);
  assert.equal(f.bound.length, tools.length);
  assert.throws(
    () => (session.reload as () => void)(),
    rejects("TOOL_REGISTRY_FROZEN"),
  );
  assert.throws(
    () => (session._refreshToolRegistry as () => void)(),
    rejects("TOOL_REGISTRY_FROZEN"),
  );
  assert.equal(reloaded, 0);
  await assert.rejects(
    f.dispatch.bind({
      agent: { state: { tools: [{ name: "extension_tool", parameters: {} }] } },
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
    f.dispatch.admission.prepare(
      "c2",
      "read",
      { path: "x" },
      "parent",
      undefined,
    ),
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
      f.store.list(f.scope).records.filter(({ kind }) => kind === "outcome")
        .length,
      1,
    );
    assert.equal(f.events().length, 0);
  }
});

test("a prepared but not yet admitted call cannot run its tool directly", async (t) => {
  const f = await setup(t);
  const adm = f.dispatch.admission;
  const args = { path: "a.txt", content: "x" };
  adm.reserve("c", "write", undefined);
  await adm.prepare("c", "write", args, undefined, undefined);
  adm.finish("c", "write", args, undefined);
  const write = f.dispatch.tools.find((x) => x.name === "write")!;
  await assert.rejects(write.execute("c", args), rejects("POLICY_DENIED"));
  assert.equal(existsSync(join(f.workDir, "a.txt")), false);
});

test("a rejecting provider registration fails the start typed; nothing is bound or frozen", async (t) => {
  const f = await setup(t, { registrationFails: true });
  let reloaded = 0;
  const session = {
    agent: {
      state: { tools: f.piTools() },
    },
    reload: () => {
      reloaded += 1;
    },
  };
  await assert.rejects(
    f.dispatch.bind(session),
    rejects("SESSION_REGISTRATION_FAILED"),
  );
  assert.equal(f.bound.length, 0);
  (session.reload as () => void)();
  assert.equal(reloaded, 1);
  assert.equal(f.registrations(), 0);
  assert.equal(
    f.store.list(f.scope).records.filter(({ kind }) => kind === "action")
      .length,
    0,
  );
});

const PATHS = [
  "reload",
  "_refreshToolRegistry",
  "_buildRuntime",
  "setActiveToolsByName",
] as const;

for (const path of PATHS) {
  test(`registry path ${path} is frozen`, async (t) => {
    const f = await setup(t);
    let ran = 0;
    const session: Record<string, unknown> & {
      agent: { state: { tools: object[] } };
    } = {
      agent: { state: { tools: f.piTools() } },
      [path]: () => {
        ran += 1;
      },
    };
    await f.dispatch.bind(session);
    assert.throws(
      () => (session[path] as () => void)(),
      rejects("TOOL_REGISTRY_FROZEN"),
    );
    assert.equal(ran, 0);
  });
}

for (const path of ["_applyToolLoadout", "_setActiveTools"] as const) {
  test(`registry path ${path} may not install a cloned or foreign tool object`, async (t) => {
    const f = await setup(t);
    const original = f.piTools();
    const state = { tools: original as object[] };
    let clone = false;
    const session: Record<string, unknown> & {
      agent: { state: { tools: object[] } };
    } = {
      agent: { state },
      // Pi: assigns agent.state.tools from the registry, cloning on a prepareLoadout hook.
      [path]: () => {
        state.tools = clone
          ? original.map((x) => ({ ...x, description: "d" }))
          : [...original];
        return state.tools;
      },
    };
    await f.dispatch.bind(session);
    // the same bound objects are fine (Pi calls this on every prompt)
    (session[path] as () => void)();
    assert.deepEqual(state.tools, original);
    const before = state.tools;
    clone = true;
    assert.throws(
      () => (session[path] as () => void)(),
      rejects("TOOL_REGISTRY_FROZEN"),
    );
    assert.equal(state.tools, before, "the previous bound tools are restored");
  });
}

test("reservation precedes beforeToolCall: the callback sees the reserved action; a denied call never reaches it", async (t) => {
  const f = await setup(t, { approve: (r) => r.toolCallId !== "deny" });
  let seen: string[] | undefined;
  await f.drive(
    "call-1",
    "write",
    { path: "a.txt", content: "x" },
    undefined,
    (id) => {
      seen = f.actions(id).map(state);
    },
  );
  assert.deepEqual(seen, ["proposed"]);

  let reached = 0;
  const hook = () => {
    reached += 1;
  };
  await assert.rejects(
    f.drive("deny", "write", { path: "b.txt", content: "x" }, undefined, hook),
    rejects("POLICY_DENIED"),
  );
  await assert.rejects(
    f.drive("nope", "rm_rf", {}, undefined, hook),
    rejects("CAPABILITY_REQUIRED"),
  );
  assert.equal(reached, 0);
  assert.equal(existsSync(join(f.workDir, "b.txt")), false);
});

test("a throwing beforeToolCall discards the reservation durably and nothing runs", async (t) => {
  const f = await setup(t);
  await assert.rejects(
    f.drive(
      "call-1",
      "write",
      { path: "a.txt", content: "x" },
      undefined,
      () => {
        throw new Error("extension veto");
      },
    ),
    /extension veto/u,
  );
  assert.equal(existsSync(join(f.workDir, "a.txt")), false);
  assert.deepEqual(f.actions("call-1").map(state), ["proposed", "denied"]);
  assert.equal(
    f
      .grants()
      .filter(({ record }) => (record as { consumedAt?: string }).consumedAt)
      .length,
    0,
  );
});

test("P1-a: approval shows the COMPLETE redacted args, including a suffix past 512 chars", async (t) => {
  let shown = "";
  const f = await setup(t, {
    approve: (r) => {
      shown = r.argsSummary;
      return false;
    },
  });
  const content = `${"A".repeat(700)} ; Set-Content evil.txt payload`;
  await assert.rejects(
    f.drive("call-1", "write", { path: "a.txt", content }),
    rejects("POLICY_DENIED"),
  );
  assert.ok(shown.length > 700);
  assert.ok(shown.includes("Set-Content evil.txt payload"));
  assert.equal(existsSync(join(f.workDir, "a.txt")), false);
});

test("P1-a: args that cannot be shown whole are denied, never truncated; approval is not even asked", async (t) => {
  const f = await setup(t);
  await assert.rejects(
    f.drive("call-1", "write", {
      path: "a.txt",
      content: "B".repeat(APPROVAL_ARGS_MAX + 1),
    }),
    rejects("POLICY_DENIED"),
  );
  assert.equal(f.approvals.length, 0);
  assert.equal(existsSync(join(f.workDir, "a.txt")), false);
  assert.deepEqual(f.actions("call-1").map(state), ["denied"]);
});

test("P1-a: when the native lane is down a once call is denied (nothing to show), not approved blind", async (t) => {
  const f = await setup(t, {
    nativeRedact: async () => {
      throw new Error("down");
    },
  });
  await assert.rejects(
    f.drive("call-1", "write", { path: "a.txt", content: "x" }),
    rejects("POLICY_DENIED"),
  );
  assert.equal(f.approvals.length, 0);
  assert.equal(existsSync(join(f.workDir, "a.txt")), false);
});

test("P1-b: a native-only secret is absent from the returned content, summary and events", async (t) => {
  const f = await setup(t, {
    nativeRedact: async (text) => ({
      text: text.replace(/hello/gu, "NATIVE-MASKED"),
    }),
  });
  const out = await f.drive("call-r", "read", { path: "hello.txt" });
  const r = returned(out);
  assert.ok(!r.text.includes("hello"));
  assert.ok(r.text.includes("NATIVE-MASKED"));
  assert.ok(!r.preview.includes("hello"));
  assert.ok(!JSON.stringify(f.events()).includes("hello"));
});

test("P1-b: errors are redacted fail-closed too", async (t) => {
  const f = await setup(t, {
    nativeRedact: async (text) => ({
      text: text.replace(/missing/gu, "MASKED"),
    }),
  });
  const out = await f.drive("call-r", "read", { path: "missing-file.txt" });
  assert.ok(!returned(out).text.includes("missing"));
  assert.equal((out as { isError: boolean }).isError, true);
});

test("P2-a: a foreign tool under a bound name is TOOL_REGISTRY_FOREIGN, even with copied parameters", async (t) => {
  const f = await setup(t);
  const real = f.dispatch.tools.find((x) => x.name === "read")!;
  for (const foreign of [
    { name: "read", parameters: { type: "object" } },
    { name: "read", parameters: JSON.parse(JSON.stringify(real.parameters)) },
    { name: "write", parameters: real.parameters },
  ])
    await assert.rejects(
      f.dispatch.bind({ agent: { state: { tools: [foreign] } } }),
      rejects("TOOL_REGISTRY_FOREIGN"),
    );
  assert.equal(f.bound.length, 0);
});

test("P2-a: an effect whose implementation was not the adapter's is recorded uncertain", async (t) => {
  const f = await setup(t);
  const adm = f.dispatch.admission;
  const args = { path: "a.txt" };
  adm.reserve("c", "read", undefined);
  await adm.prepare("c", "read", args, undefined, undefined);
  adm.finish("c", "read", args, undefined);
  await assert.rejects(
    adm.execute(
      "c",
      "read",
      args,
      async () => ({ result: {}, isError: false }),
      undefined,
    ),
    rejects("EFFECT_UNCERTAIN"),
  );
  assert.ok(f.actions("c").map(state).includes("uncertain"));
});

test("P2-b: the live registry array is frozen; a replaced registry fails every dispatch phase", async (t) => {
  const f = await setup(t);
  const session = { agent: { state: { tools: f.piTools() as object[] } } };
  await f.dispatch.bind(session);
  assert.throws(
    () => session.agent.state.tools.push({ name: "extra" }),
    TypeError,
  );
  const first = f.bound[0]!;
  const adm = f.admissions.get(first)!;
  // assignment replaces the collection with one holding a foreign tool object
  session.agent.state.tools = [...f.bound, { name: "extra", parameters: {} }];
  assert.throws(
    () => adm.reserve("c", "read", undefined),
    rejects("TOOL_REGISTRY_FROZEN"),
  );
  await assert.rejects(
    adm.prepare("c", "read", { path: "hello.txt" }, undefined, undefined),
    rejects("TOOL_REGISTRY_FROZEN"),
  );
  await assert.rejects(
    Promise.resolve().then(() =>
      adm.execute("c", "read", {}, async () => ({ isError: false }), undefined),
    ),
    rejects("TOOL_REGISTRY_FROZEN"),
  );
  assert.equal(f.actions("c").length, 0);
});

test("P2-b: a prototype-level registry refresh (instance override bypassed) fails dispatch closed", async (t) => {
  const f = await setup(t);
  class Sess {
    agent = { state: { tools: f.piTools() as object[] } };
    _refreshToolRegistry() {
      this.agent.state.tools = f.piTools().map((x) => ({ ...x }));
    }
  }
  const session = new Sess();
  await f.dispatch.bind(session);
  assert.throws(
    () => session._refreshToolRegistry(),
    rejects("TOOL_REGISTRY_FROZEN"),
  );
  Sess.prototype._refreshToolRegistry.call(session);
  const adm = f.admissions.get(f.bound[0]!)!;
  await assert.rejects(
    adm.prepare("c", "read", { path: "hello.txt" }, undefined, undefined),
    rejects("TOOL_REGISTRY_FROZEN"),
  );
  assert.equal(f.actions("c").length, 0);
});

test("P3: execute without finish leaves no dangling proposed reservation after discard", async (t) => {
  const f = await setup(t);
  const adm = f.dispatch.admission;
  const args = { path: "a.txt", content: "x" };
  adm.reserve("c", "write", undefined);
  await adm.prepare("c", "write", args, undefined, undefined);
  await assert.rejects(
    adm.execute(
      "c",
      "write",
      args,
      async () => ({ isError: false }),
      undefined,
    ),
    rejects("PREPARATION_REQUIRED"),
  );
  adm.discard("c", "denied");
  assert.deepEqual(f.actions("c").map(state), ["proposed", "denied"]);
  assert.equal(existsSync(join(f.workDir, "a.txt")), false);
});
