import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../packages/splyce-pi/dist/store.js";
import { ConfigAuthority } from "../packages/splyce-pi/dist/config.js";
import { createProviderProfiles } from "../packages/splyce-pi/dist/provider-profiles.js";
import { createNativeProviderSetup } from "../packages/splyce-pi/src/native-provider-setup.mjs";
import { NativeControl } from "../packages/splyce-pi/src/native-control.mjs";
import { actionArgumentsDigest } from "../packages/splyce-pi/dist/policy.js";
import { SessionMap } from "../packages/splyce-pi/dist/session-map.js";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createSplyceOwner } from "../vendor/pi/packages/agent/dist/splyce-readiness.js";
import { acquireNativeSessionWriter } from "../packages/splyce-pi/src/native-session-writer.mjs";
import {
  createNativeArgumentsArtifact,
  createNativeSessionFactory,
  resolveNativeSessionSelection,
} from "../packages/splyce-pi/src/native-session-factory.mjs";

function fixture(
  t,
  chat,
  endpoint = "https://example.test/v1",
  apiFamily = "openai-completions",
) {
  const dir = mkdtempSync(join(tmpdir(), "splyce-session-selection-"));
  const cwd = join(dir, "workspace");
  mkdirSync(cwd);
  const store = Store.open(join(dir, "store.db"));
  const cleanup = [];
  t.after(async () => {
    for (const close of cleanup.reverse()) await close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const caller = {
    sessionId: "setup",
    configRevision: "cfg-0",
    profileRevision: "cfg-0",
    policyRevision: "cfg-0",
    resolveReference: (ref, scope) =>
      ref === scope ||
      store
        .list(scope)
        .records.some(
          ({ record }) =>
            record.recordId === ref ||
            record.artifactId === ref ||
            record.profileId === ref ||
            record.providerConnectionId === ref ||
            (record.endpointId &&
              `${record.endpointId}@${record.revision}` === ref),
        ),
  };
  const stat = statSync(cwd, { bigint: true });
  const workspace = store.admitWorkspace(
    {
      canonicalPath: cwd,
      volumeSerial: String(stat.dev),
      fileId: String(stat.ino),
    },
    caller,
  );
  const metadata = {
    requestId: "request1",
    workspaceId: workspace.workspaceId,
    providerConnectionId: "conn1",
    profileId: "profile1",
    apiFamily,
    endpoint,
    locality: "hosted",
    chat,
    accountScopeRef: "provider-default",
    expectedConnectionRevision: null,
    expectedProfileRevision: null,
    expectedEndpointRevision: null,
    credentialKind: "new",
  };
  const setup = createNativeProviderSetup(store, dir);
  const prepared = setup.prepare(metadata);
  setup.commit({ metadata, credentialRef: prepared.credentialRef });
  const config = new ConfigAuthority(store);
  const profiles = createProviderProfiles({ store, config });
  for (const id of ["intent1", "change1"]) {
    const bytes = Buffer.from("{}");
    writeFileSync(join(dir, `${id}.json`), bytes);
    store.append(
      {
        kind: "artifact",
        record: {
          schemaVersion: 1,
          recordId: id,
          scopeId: workspace.workspaceId,
          createdAt: new Date().toISOString(),
          sourceIds: [],
          artifactId: id,
          digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
          mediaType: "application/json",
          byteLength: bytes.length,
          retentionClass: "workspace",
          locationRef: id,
        },
      },
      caller,
    );
  }
  profiles.select(
    {
      scopeId: workspace.workspaceId,
      profileId: "profile1",
      profileRevision: "p1",
      expectedConfigRevision: "cfg-0",
      acceptedConfigRevision: "cfg-1",
      transitionId: "transition1",
      intentRef: "intent1",
      changedValuesArtifactId: "change1",
    },
    caller,
  );
  const input = {
    store,
    profiles,
    directory: dir,
    workspaceId: workspace.workspaceId,
    profileId: "profile1",
    profileRevision: "p1",
  };
  return { store, input, path: join(dir, "store.db"), dir, caller, cleanup };
}

test("real Pi preparation commits its preview but cannot publish unqualified readiness", async (t) => {
  const { store, input, dir, caller, cleanup } = fixture(t, {
    modelId: "model1",
    model: { contextWindow: 8192, maxOutputTokens: 1024 },
  });
  let control;
  control = new NativeControl(async ({ native }) =>
    control.accept({
      native: {
        id: native.id,
        ok: true,
        value: { text: native.params.text, redactedCount: 0 },
      },
    }),
  );
  t.after(() => control.shutdown());
  const factory = createNativeSessionFactory({
    store,
    profiles: input.profiles,
    control,
    directory: dir,
  });
  const request = {
    requestId: "start1",
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    expectedConfigRevision: "cfg-1",
  };
  const before = store.cursor();
  const value = await factory.prepare({
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    profileRevision: input.profileRevision,
    requestId: request.requestId,
  });
  cleanup.push(() => factory.dispose(value));
  t.after(() => factory.dispose(value));
  assert.equal(store.cursor(), before);
  await assert.rejects(() => factory.bind(value), {
    code: "NATIVE_SESSION_UNAVAILABLE",
  });
  assert.equal(store.cursor(), before);
  const capture = store.prepareNativeSessionSetup("session.start", request);
  const commit = store.commitNativeSessionStart(
    capture,
    { piSessionId: value.piSessionId, branchAnchor: value.branchAnchor },
    caller,
  );
  assert.equal(commit.result.sessionId, value.piSessionId);
  assert.deepEqual(commit.branchAnchor, value.branchAnchor);
  const committedCursor = store.cursor();
  await assert.rejects(() => factory.bind(value), {
    code: "NATIVE_SESSION_UNAVAILABLE",
  });
  assert.equal(store.cursor(), committedCursor);
  store.assertNativeSessionStartCurrent({
    workspaceId: input.workspaceId,
    sessionId: value.piSessionId,
    sessionRevision: commit.result.sessionRevision,
  });
  await factory.dispose(value);
  await factory.dispose(value);
  await assert.rejects(
    () =>
      factory.restore({
        workspaceId: input.workspaceId,
        piSessionId: value.piSessionId,
        branchAnchor: value.branchAnchor,
      }),
    { code: "NATIVE_SESSION_UNAVAILABLE" },
  );
  assert.equal(store.cursor(), committedCursor);
});

test("prepared owner fails closed if deletion epoch changes", async (t) => {
  const { store, input, dir, cleanup } = fixture(t, {
    modelId: "model1",
    model: { contextWindow: 8192, maxOutputTokens: 1024 },
  });
  let control;
  control = new NativeControl(async ({ native }) =>
    control.accept({
      native: {
        id: native.id,
        ok: true,
        value: { text: native.params.text, redactedCount: 0 },
      },
    }),
  );
  t.after(() => control.shutdown());
  const factory = createNativeSessionFactory({
    store,
    profiles: input.profiles,
    control,
    directory: dir,
  });
  const value = await factory.prepare({
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    profileRevision: input.profileRevision,
    requestId: "epoch1",
  });
  cleanup.push(() => factory.dispose(value));
  store.noteDeletion("intent1");
  const cursor = store.cursor();
  await assert.rejects(() => factory.bind(value), {
    code: "NATIVE_SESSION_UNAVAILABLE",
  });
  assert.equal(store.cursor(), cursor);
  await factory.dispose(value);
});

test("restore preserves the committed start anchor and reconciles the actual later Pi leaf", async (t) => {
  const { store, input, dir, caller, cleanup } = fixture(t, {
    modelId: "model1",
    model: { contextWindow: 8192, maxOutputTokens: 1024 },
  });
  let control;
  control = new NativeControl(async ({ native }) =>
    control.accept({
      native: {
        id: native.id,
        ok: true,
        value: { text: native.params.text, redactedCount: 0 },
      },
    }),
  );
  t.after(() => control.shutdown());
  const sessionDir = join(
    dir,
    "sessions",
    createHash("sha256").update(input.workspaceId).digest("hex"),
  );
  mkdirSync(sessionDir, { recursive: true });
  let committed, priorLease;
  const owner = createSplyceOwner(() => {
    const workspace = store.getWorkspace(input.workspaceId);
    const actual = statSync(workspace.canonicalPath, { bigint: true });
    assert.equal(String(actual.dev), workspace.volumeSerial);
    assert.equal(String(actual.ino), workspace.fileId);
    priorLease?.assertCurrent();
    if (committed)
      store.assertNativeSessionStartCurrent({
        workspaceId: input.workspaceId,
        sessionId: committed.result.sessionId,
        sessionRevision: committed.result.sessionRevision,
      });
  });
  const manager = await SessionManager.createOwned(
    store.getWorkspace(input.workspaceId).canonicalPath,
    (subject) =>
      owner.bindPersistence(
        subject,
        async (text, signal) => (await control.redact(text, signal)).text,
      ),
    sessionDir,
  );
  priorLease = acquireNativeSessionWriter(manager.getSessionFile());
  cleanup.push(() => priorLease.close());
  t.after(() => priorLease.close());
  const piSessionId = manager.getSessionId();
  const key = { scopeId: input.workspaceId, sessionId: piSessionId };
  const map = new SessionMap(store, {
    configRevision: "cfg-1",
    profileRevision: "p1",
    policyRevision: "cfg-0",
    resolveReference(ref, scope) {
      return (
        scope === input.workspaceId &&
        (ref === scope ||
          ref === piSessionId ||
          manager.getEntries().some((entry) => entry.id === ref) ||
          store
            .list(scope)
            .records.some(
              ({ record }) =>
                record.recordId === ref ||
                record.artifactId === ref ||
                record.branchAnchorId === ref,
            ))
      );
    },
  });
  const historical = map.preview(key, manager).anchor;
  const request = {
    requestId: "restore1",
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    expectedConfigRevision: "cfg-1",
  };
  const capture = store.prepareNativeSessionSetup("session.start", request);
  committed = store.commitNativeSessionStart(
    capture,
    { piSessionId, branchAnchor: historical },
    caller,
  );
  await manager.withPersistence((draft) =>
    draft.appendMessage({
      role: "user",
      content: [{ type: "text", text: "later entry" }],
      timestamp: 0,
    }),
  );
  const forkPoint = manager.getLeafId();
  await manager.withPersistence((draft) =>
    draft.appendMessage({
      role: "user",
      content: [{ type: "text", text: "other branch" }],
      timestamp: 1,
    }),
  );
  await manager.withPersistence((draft) => draft.branch(forkPoint));
  await manager.withPersistence((draft) =>
    draft.appendMessage({
      role: "user",
      content: [{ type: "text", text: "selected branch" }],
      timestamp: 2,
    }),
  );
  const leaf = manager.getLeafId();
  assert.ok(leaf);
  const activeAnchor = map.preview(key, manager).anchor;
  owner.dispose();
  priorLease.close();
  const factory = createNativeSessionFactory({
    store,
    profiles: input.profiles,
    control,
    directory: dir,
  });
  const value = await factory.restore({
    workspaceId: input.workspaceId,
    piSessionId,
    branchAnchor: historical,
  });
  cleanup.push(() => factory.dispose(value));
  t.after(() => factory.dispose(value));
  assert.deepEqual(value.branchAnchor, historical);
  await assert.rejects(() => factory.bind(value), {
    code: "NATIVE_SESSION_UNAVAILABLE",
  });
  const anchors = store
    .list(input.workspaceId, 0, piSessionId)
    .records.filter(({ kind }) => kind === "branchAnchor");
  assert.ok(anchors.length >= 3);
  assert.equal(
    anchors.findLast(
      ({ record }) => record.branchAnchorId === activeAnchor.branchAnchorId,
    ).record.activeLeafEntryId,
    leaf,
  );
  assert.equal(
    anchors[0].record.activeLeafEntryId,
    historical.activeLeafEntryId,
  );
  store.assertNativeSessionStartCurrent({
    workspaceId: input.workspaceId,
    sessionId: piSessionId,
    sessionRevision: committed.result.sessionRevision,
  });
  await factory.dispose(value);
});

test("actual native redaction control validates semantic units before writing exact argument bytes", async (t) => {
  const { store, input, dir, caller } = fixture(t, {
    modelId: "model1",
    model: { contextWindow: 8192, maxOutputTokens: 1024 },
  });
  let redact = false;
  let failRedaction = false;
  let calls = 0;
  let control;
  control = new NativeControl(async ({ native }) => {
    assert.equal(native.method, "credential.redact");
    calls++;
    if (failRedaction) {
      control.accept({
        native: {
          id: native.id,
          ok: false,
          error: { code: "PERSIST_REDACTION_UNAVAILABLE" },
        },
      });
      return;
    }
    const text = redact
      ? native.params.text.replace("sensitive", "[redacted]")
      : native.params.text;
    control.accept({
      native: {
        id: native.id,
        ok: true,
        value: { text, redactedCount: text === native.params.text ? 0 : 1 },
      },
    });
  });
  t.after(() => control.shutdown());
  const semantic = {
    schema: "splyce-provider-request-v1",
    apiFamily: "openai-completions",
    endpointRef: "endpoint1",
    model: "model1",
    context: {
      systemPrompt: "system",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
    },
    options: { model: { id: "model1" } },
  };
  const args = {
    store,
    control,
    directory: dir,
    workspaceId: input.workspaceId,
    caller,
    semantic,
    assertCurrent() {
      const selected = resolveNativeSessionSelection(input);
      const actual = statSync(selected.state.workspace.canonicalPath, {
        bigint: true,
      });
      assert.equal(String(actual.dev), selected.state.workspace.volumeSerial);
      assert.equal(String(actual.ino), selected.state.workspace.fileId);
    },
  };
  const artifact = await createNativeArgumentsArtifact(args);
  assert.equal(calls, 4);
  assert.equal(artifact.digest, actionArgumentsDigest(semantic));
  assert.deepEqual(artifact.semantic, semantic);
  artifact.verify();
  const before = store.cursor();
  redact = true;
  semantic.context.messages[0].content = "sensitive";
  await assert.rejects(() => createNativeArgumentsArtifact(args), {
    code: "NATIVE_ARGUMENTS_UNAVAILABLE",
  });
  assert.equal(store.cursor(), before);
  redact = false;
  failRedaction = true;
  await assert.rejects(() => createNativeArgumentsArtifact(args), {
    code: "PERSIST_REDACTION_UNAVAILABLE",
  });
  assert.equal(store.cursor(), before);
  const controller = new AbortController();
  controller.abort();
  const previousCalls = calls;
  await assert.rejects(
    () => createNativeArgumentsArtifact({ ...args, signal: controller.signal }),
    { code: "NATIVE_ARGUMENTS_UNAVAILABLE" },
  );
  assert.equal(calls, previousCalls);
  assert.equal(store.cursor(), before);
  writeFileSync(
    join(dir, "arguments", `${artifact.digest.slice(7)}.json`),
    "{}",
  );
  assert.throws(() => artifact.verify());
});

for (const field of ["model", "endpointRef"]) {
  test(`argument metadata ${field} is redacted before any write`, async (t) => {
    const { store, input, dir, caller } = fixture(t, {
      modelId: "model1",
      model: { contextWindow: 8192, maxOutputTokens: 1024 },
    });
    let control;
    control = new NativeControl(async ({ native }) => {
      const text = native.params.text.replace("sensitive", "[redacted]");
      control.accept({
        native: {
          id: native.id,
          ok: true,
          value: { text, redactedCount: text === native.params.text ? 0 : 1 },
        },
      });
    });
    t.after(() => control.shutdown());
    const semantic = {
      schema: "splyce-provider-request-v1",
      apiFamily: "openai-completions",
      endpointRef: "endpoint1",
      model: "model1",
      context: { messages: [{ role: "user", content: "hello" }], tools: [] },
      options: { model: { id: "model1" } },
    };
    semantic[field] = "sensitive";
    const cursor = store.cursor();
    await assert.rejects(
      () =>
        createNativeArgumentsArtifact({
          store,
          control,
          directory: dir,
          workspaceId: input.workspaceId,
          caller,
          semantic,
          assertCurrent() {
            resolveNativeSessionSelection(input);
          },
        }),
      { code: "NATIVE_ARGUMENTS_UNAVAILABLE" },
    );
    assert.equal(store.cursor(), cursor);
    assert.equal(existsSync(join(dir, "arguments")), false);
  });
}

test("redaction suspension cannot publish arguments after selected authority is deleted", async (t) => {
  const { store, input, dir, caller } = fixture(t, {
    modelId: "model1",
    model: { contextWindow: 8192, maxOutputTokens: 1024 },
  });
  let reached, release;
  const entered = new Promise((resolve) => {
    reached = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let control;
  control = new NativeControl(async ({ native }) => {
    reached();
    await gate;
    control.accept({
      native: {
        id: native.id,
        ok: true,
        value: { text: native.params.text, redactedCount: 0 },
      },
    });
  });
  t.after(() => {
    release();
    control.shutdown();
  });
  const selected = resolveNativeSessionSelection(input);
  const descriptor = selected.state.records.find(
    ({ kind, record }) => kind === "artifact" && record.role === "chat",
  ).record;
  const semantic = {
    schema: "splyce-provider-request-v1",
    apiFamily: "openai-completions",
    endpointRef: "endpoint1",
    model: "model1",
    context: { messages: [{ role: "user", content: "hello" }], tools: [] },
    options: { model: { id: "model1" } },
  };
  const cursor = store.cursor();
  const pending = createNativeArgumentsArtifact({
    store,
    control,
    directory: dir,
    workspaceId: input.workspaceId,
    caller,
    semantic,
    assertCurrent() {
      resolveNativeSessionSelection(input);
    },
  });
  await entered;
  store.noteDeletion(descriptor.recordId);
  release();
  await assert.rejects(() => pending, { code: "NATIVE_SESSION_UNAVAILABLE" });
  assert.equal(store.cursor(), cursor);
});

test("real selected setup resolves exact user model and rejects removed descriptor", (t) => {
  const { store, input } = fixture(t, {
    modelId: "model1",
    model: { contextWindow: 8192, maxOutputTokens: 1024 },
  });
  const result = resolveNativeSessionSelection(input);
  assert.equal(result.model.provider, "conn1");
  assert.equal(result.model.baseUrl, "https://example.test/v1");
  assert.equal(result.model.maxTokens, 1024);
  assert.equal(result.descriptor.costKnown, false);
  assert.throws(() =>
    resolveNativeSessionSelection({ ...input, profileRevision: "p2" }),
  );
  const record = result.state.records.find(
    ({ kind, record }) => kind === "artifact" && record.role === "chat",
  ).record;
  store.noteDeletion(record.recordId);
  assert.throws(() => resolveNativeSessionSelection(input));
});

for (const kind of ["account", "limits", "egress"]) {
  test(`${kind} descriptor bytes must match the real artifact record`, (t) => {
    const { input, dir } = fixture(t, {
      modelId: "model1",
      model: { contextWindow: 8192, maxOutputTokens: 1024 },
    });
    const selected = resolveNativeSessionSelection(input);
    const id =
      kind === "account"
        ? selected.connection.accountScopeRef
        : kind === "limits"
          ? selected.profile.limitsArtifactId
          : selected.profile.egressPolicyRefs[0];
    const artifact = selected.state.records.find(
      ({ kind, record }) => kind === "artifact" && record.artifactId === id,
    ).record;
    const name = createHash("sha256").update(artifact.recordId).digest("hex");
    writeFileSync(join(dir, "setup-descriptors", `${name}.json`), "{}");
    assert.throws(() => resolveNativeSessionSelection(input));
  });
}

test("selected catalog metadata is rechecked against the pinned catalog", (t) => {
  const { input, path } = fixture(
    t,
    { modelId: "gpt-4o" },
    "https://api.openai.com/v1",
    "openai-responses",
  );
  const result = resolveNativeSessionSelection(input);
  assert.equal(result.model.id, "gpt-4o");
  assert.equal(result.descriptor.source, "catalog");
  assert.equal(result.model.provider, "conn1");
  assert.equal(result.descriptor.costKnown, false);
  const artifact = result.state.records.find(
    ({ kind, record }) => kind === "artifact" && record.role === "chat",
  ).record;
  const db = new DatabaseSync(path);
  const changed = structuredClone(artifact);
  changed.descriptor.catalogVersion = "forged-version";
  const json = JSON.stringify(changed.descriptor);
  changed.digest = `sha256:${createHash("sha256").update(json).digest("hex")}`;
  changed.byteLength = Buffer.byteLength(json);
  db.prepare("UPDATE records SET payload = ? WHERE record_id = ?").run(
    JSON.stringify(changed),
    artifact.recordId,
  );
  db.close();
  assert.throws(() => resolveNativeSessionSelection(input));
});
