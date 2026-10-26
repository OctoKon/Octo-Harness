import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  bindSplyceToolAdmission,
  runToolCall,
} from "@earendil-works/pi-agent-core";
import {
  NativePolicy,
  actionArgumentsDigest,
} from "../packages/splyce-pi/dist/policy.js";
import { Store } from "../packages/splyce-pi/dist/store.js";
import { NestedToolCallRunner } from "../vendor/pi/packages/coding-agent/dist/core/nested-tool-calls.js";

const records = JSON.parse(
  await readFile(
    new URL("./fixtures/contracts/records.json", import.meta.url),
    "utf8",
  ),
);
const assistant = {
  role: "assistant",
  content: [],
  api: "openai-completions",
  provider: "fixture",
  model: "fixture",
  timestamp: 0,
  stopReason: "toolUse",
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
};

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "splyce-admission-"));
  const path = join(dir, "store.db");
  const canary = join(dir, "fixture.txt");
  await writeFile(canary, "unchanged");
  const store = Store.open(path);
  t.after(async () => {
    if (!store.closed) store.close();
    await rm(dir, { recursive: true, force: true });
  });
  const fixtureRefs = new Set([
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
    resolveReference(id, scope) {
      return (
        scope === "w-demo" &&
        (fixtureRefs.has(id) ||
          store
            .list(scope)
            .records.some(
              ({ record }) =>
                record.recordId === id ||
                record.runId === id ||
                record.actionId === id,
            ))
      );
    },
  };
  store.append({ kind: "run", record: records.run }, caller);
  const ownership = store.acquireWorkspace("w-demo", "s1");
  let active = { ...caller, grantIds: ["grant1"], planMode: false };
  const policy = new NativePolicy(store, caller, () => active);
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
  policy.authorize(permit);
  let after = 0;
  let executions = 0;
  let dispatchHistory;
  const tool = {
    name: permit.toolName,
    label: "Fixture write",
    description: "Write owned fixture",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
    async execute(_id, admittedArgs) {
      executions++;
      const fresh = Store.open(path);
      try {
        dispatchHistory = fresh
          .list("w-demo")
          .records.filter(({ kind }) => kind === "action")
          .map(({ record }) => record.state);
      } finally {
        fresh.close();
      }
      await writeFile(canary, admittedArgs.text);
      return { content: [{ type: "text", text: "written" }], details: {} };
    },
  };
  const unbind = bindSplyceToolAdmission(tool, policy);
  t.after(unbind);
  const context = { messages: [], tools: [tool] };
  const call = {
    type: "toolCall",
    id: permit.toolCallId,
    name: tool.name,
    arguments: args,
  };
  const options = {
    tools: [tool],
    assistantMessage: assistant,
    context,
    afterToolCall: async () => {
      after++;
    },
  };
  return {
    dir,
    path,
    canary,
    store,
    caller,
    ownership,
    policy,
    permit,
    tool,
    call,
    options,
    setActive(value) {
      active = { ...active, ...value };
    },
    get executions() {
      return executions;
    },
    get completions() {
      return after;
    },
    get dispatchHistory() {
      return dispatchHistory;
    },
  };
}

test("native Pi tool effect follows durable decision/intent and precedes durable outcome", async (t) => {
  const f = await fixture(t);
  const result = await runToolCall(f.call, f.options);
  assert.equal(result.isError, false);
  assert.equal(await readFile(f.canary, "utf8"), "changed");
  assert.deepEqual(
    f.dispatchHistory,
    ["approved", "running"],
    "physical effect requires independently readable durable decision and intent",
  );
  const reopen = Store.open(f.path);
  try {
    assert.deepEqual(
      reopen
        .list("w-demo")
        .records.filter(({ kind }) => kind !== "run")
        .map(({ kind, record }) => [kind, record.state ?? record.effectState]),
      [
        ["action", "approved"],
        ["action", "running"],
        ["outcome", "observed-success"],
        ["action", "completed"],
      ],
    );
  } finally {
    reopen.close();
  }
  assert.equal(f.completions, 1);
  await assert.rejects(runToolCall(f.call, f.options), {
    code: "ACTION_REQUIRES_RECONCILIATION",
  });
  assert.equal(
    f.executions,
    1,
    "replaying a completed or unresolved intent never repeats the effect",
  );
});

for (const change of [
  "revoked",
  "planMode",
  "config",
  "ownership",
  "arguments",
]) {
  test(`native final dispatch rejects ${change} after asynchronous preparation`, async (t) => {
    const f = await fixture(t);
    const options = {
      ...f.options,
      beforeToolCall: async ({ args }) => {
        await Promise.resolve();
        if (change === "revoked") f.setActive({ grantIds: [] });
        if (change === "planMode") f.setActive({ planMode: true });
        if (change === "config") f.setActive({ configRevision: "cfg2" });
        if (change === "ownership")
          f.store.renewWorkspace("w-demo", "s1", f.ownership.epoch);
        if (change === "arguments") args.text = "different";
      },
    };
    let error;
    try {
      await runToolCall(f.call, options);
    } catch (caught) {
      error = caught;
    }
    assert.equal(
      await readFile(f.canary, "utf8"),
      "unchanged",
      "denied native dispatch must preserve physical bytes",
    );
    assert.ok(error, "native denial must reject");
    assert.equal(f.executions, 0);
    assert.equal(f.completions, 0);
  });
}

test("actual pre-effect SQLite commit failure blocks physical dispatch", async (t) => {
  const f = await fixture(t);
  f.store.db.exec(
    "CREATE TRIGGER refuse_intent BEFORE INSERT ON records WHEN NEW.kind = 'action' BEGIN SELECT RAISE(ABORT, 'fixture'); END;",
  );
  await assert.rejects(runToolCall(f.call, f.options));
  assert.equal(
    await readFile(f.canary, "utf8"),
    "unchanged",
    "failed intent must prevent physical bytes changing",
  );
  assert.equal(f.executions, 0);
  assert.equal(f.completions, 0);
  assert.equal(
    f.store.list("w-demo").records.length,
    1,
    "failed batch leaves no partial decision",
  );
});

test("terminal run record revokes a permit bound to its older running record", async (t) => {
  const f = await fixture(t);
  f.store.append(
    {
      kind: "run",
      record: { ...records.run, recordId: "run-terminal", state: "completed" },
    },
    f.caller,
  );
  await assert.rejects(runToolCall(f.call, f.options), {
    code: "POLICY_DENIED",
  });
  assert.equal(await readFile(f.canary, "utf8"), "unchanged");
  assert.equal(f.executions, 0);
});

test("terminal parent cannot authorize a nested action through its old intent", async (t) => {
  const f = await fixture(t);
  await runToolCall(f.call, f.options);
  await writeFile(f.canary, "after-parent");
  f.policy.authorize({
    ...f.permit,
    toolCallId: "child",
    actionId: "child-action",
    idempotencyKey: "child-effect",
    parentActionId: "a1",
  });
  await assert.rejects(runToolCall({ ...f.call, id: "child" }, f.options), {
    code: "PARENT_NOT_RUNNING",
  });
  assert.equal(await readFile(f.canary, "utf8"), "after-parent");
  assert.equal(f.executions, 1);
});

test("post-effect SQLite failure exposes no completion and cannot replay", async (t) => {
  const f = await fixture(t);
  f.store.db.exec(
    "CREATE TRIGGER refuse_outcome BEFORE INSERT ON records WHEN NEW.kind = 'outcome' BEGIN SELECT RAISE(ABORT, 'fixture'); END;",
  );
  await assert.rejects(runToolCall(f.call, f.options));
  assert.equal(await readFile(f.canary, "utf8"), "changed");
  assert.equal(
    f.completions,
    0,
    "outcome failure cannot reach Pi completion hook",
  );
  assert.deepEqual(
    f.store
      .list("w-demo")
      .records.filter(({ kind }) => kind === "action")
      .map(({ record }) => record.state),
    ["approved", "running"],
  );
  await assert.rejects(runToolCall(f.call, f.options), {
    code: "ACTION_REQUIRES_RECONCILIATION",
  });
  assert.equal(f.executions, 1);
});

test("real nested runner uses the same current native admission", async (t) => {
  const f = await fixture(t);
  f.policy.authorize({
    ...f.permit,
    toolCallId: "parent/1",
    actionId: "nested",
    idempotencyKey: "nested-effect",
  });
  f.setActive({ grantIds: [] });
  const events = [];
  const runner = new NestedToolCallRunner({
    getTools: () => [f.tool],
    isSequential: () => false,
    emit: async (event) => {
      events.push(event.type);
    },
    runToolCall: (call, _parent, signal, onUpdate) =>
      runToolCall(call, { ...f.options, signal, onUpdate }),
  });
  await assert.rejects(runner.execute("parent", f.tool.name, f.call.arguments));
  assert.equal(
    await readFile(f.canary, "utf8"),
    "unchanged",
    "denied nested effect must preserve physical bytes",
  );
  assert.equal(f.executions, 0);
  assert.equal(events.includes("tool_execution_end"), false);
});

test("process death after durable intent reopens unresolved and never replays", async (t) => {
  const f = await fixture(t);
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./native-admission-child.mjs", import.meta.url)),
      f.dir,
      JSON.stringify(f.permit),
    ],
    { stdio: "pipe", windowsHide: true },
  );
  let output = "";
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const exit = new Promise((resolve) => child.once("exit", resolve));
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  });
  const deadline = Date.now() + 15000;
  while (true) {
    try {
      await readFile(join(f.dir, "intent-ready"));
      break;
    } catch {}
    assert.equal(child.exitCode, null, `child exited before intent: ${output}`);
    assert.ok(Date.now() < deadline, `child intent timeout: ${output}`);
    await delay(25);
  }
  assert.equal(child.kill("SIGKILL"), true);
  await exit;
  const reopened = Store.open(f.path);
  try {
    assert.deepEqual(
      reopened
        .list("w-demo")
        .records.filter(({ kind }) => kind === "action")
        .map(({ record }) => record.state),
      ["approved", "running"],
    );
    assert.equal(
      reopened.list("w-demo").records.some(({ kind }) => kind === "outcome"),
      false,
    );
  } finally {
    reopened.close();
  }
  await assert.rejects(runToolCall(f.call, f.options), {
    code: "ACTION_REQUIRES_RECONCILIATION",
  });
  assert.equal(await readFile(f.canary, "utf8"), "unchanged");
  assert.equal(f.executions, 0);
});

test("removing the native authority or intent commit fails physical assertions", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "splyce-admission-mutation-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const loader = join(dir, "mutation.mjs");
  await writeFile(
    loader,
    `import { registerHooks } from 'node:module';
registerHooks({load(url, context, next) {
  const result = next(url, context);
  if (!url.endsWith('/splyce-pi/dist/policy.js')) return result;
  let source = String(result.source);
  if (process.env.SPLYCE_ADMISSION_MUTATION === 'authority') {
    const start = source.indexOf('    check(toolCallId, toolName, signal) {');
    const end = source.indexOf('    async execute(', start);
    if (start < 0 || end < 0) throw new Error('authority mutation target missing');
    source = source.slice(0, start) + '    check() {}\\n' + source.slice(end);
  } else {
    const start = source.indexOf('this.store.appendBatch(');
    if (start < 0) throw new Error('intent mutation target missing');
    let depth = 1, end = start + 'this.store.appendBatch('.length;
    for (; depth && end < source.length; end++) {
      if (source[end] === '(') depth++;
      if (source[end] === ')') depth--;
    }
    if (depth) throw new Error('intent mutation not closed');
    source = source.slice(0, start) + '({seqs: []})' + source.slice(end);
  }
  return {...result, source};
}});`,
  );
  const environment = Object.fromEntries(
    ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "PATHEXT"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  for (const [mutation, pattern, observation] of [
    [
      "authority",
      "native final dispatch rejects revoked",
      "denied native dispatch must preserve physical bytes",
    ],
    [
      "intent",
      "actual pre-effect SQLite commit failure",
      "failed intent must prevent physical bytes changing",
    ],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(loader).href,
        "--test",
        "--test-name-pattern",
        pattern,
        fileURLToPath(import.meta.url),
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
        env: { ...environment, SPLYCE_ADMISSION_MUTATION: mutation },
      },
    );
    assert.notEqual(result.status, 0, `${mutation} removal must fail`);
    assert.ok(
      (result.stdout + result.stderr).includes(observation),
      `${mutation} must fail its physical assertion: ${result.stdout}${result.stderr}`,
    );
  }
});
