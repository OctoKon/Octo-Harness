import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  canonicalEndpointUrl,
  originView,
  TRANSPORT_LIMITS,
} from "../dist/contracts.js";
import { lookupPinnedModel } from "./model-catalog.mjs";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createSplyceOwner } from "../../../vendor/pi/packages/agent/dist/splyce-readiness.js";
import { NativeControl } from "./native-control.mjs";
import { acquireNativeSessionWriter } from "./native-session-writer.mjs";
import { serializeActionArguments } from "../dist/policy.js";
import { SessionMap } from "../dist/session-map.js";
import { INITIAL_CONFIG_REVISION } from "../dist/store.js";

const unavailable = () =>
  Object.assign(new Error("Native session unavailable"), {
    code: "NATIVE_SESSION_UNAVAILABLE",
  });

export async function createNativeArgumentsArtifact({
  store,
  control,
  directory,
  workspaceId,
  caller,
  semantic,
  assertCurrent,
  signal,
}) {
  const deny = () =>
    Object.assign(new Error("Native arguments unavailable"), {
      code: "NATIVE_ARGUMENTS_UNAVAILABLE",
    });
  const exact = (value, keys) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
  if (
    !(control instanceof NativeControl) ||
    typeof assertCurrent !== "function" ||
    !exact(semantic, [
      "schema",
      "apiFamily",
      "endpointRef",
      "model",
      "context",
      "options",
    ]) ||
    semantic.schema !== "splyce-provider-request-v1" ||
    !exact(semantic.context, [
      "messages",
      "tools",
      ...(Object.hasOwn(semantic.context ?? {}, "systemPrompt")
        ? ["systemPrompt"]
        : []),
    ]) ||
    !Array.isArray(semantic.context.messages) ||
    !Array.isArray(semantic.context.tools) ||
    !exact(semantic.options, ["model"]) ||
    !semantic.options.model
  )
    throw deny();
  const bytes = Buffer.from(serializeActionArguments(semantic));
  if (bytes.length > 4194304) throw deny();
  const snapshot = JSON.parse(bytes.toString("utf8"));
  const freeze = (value) => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  freeze(snapshot);
  const units = [
    {
      schema: snapshot.schema,
      apiFamily: snapshot.apiFamily,
      endpointRef: snapshot.endpointRef,
      model: snapshot.model,
    },
    snapshot.options.model,
    ...(snapshot.context.systemPrompt === undefined
      ? []
      : [snapshot.context.systemPrompt]),
    ...snapshot.context.messages,
    ...snapshot.context.tools,
  ];
  for (const unit of units) {
    assertCurrent();
    if (signal?.aborted) throw deny();
    const serialized = serializeActionArguments(unit);
    const result = await control.redact(serialized, signal);
    assertCurrent();
    if (
      signal?.aborted ||
      result.text !== serialized ||
      result.redactedCount !== 0
    )
      throw deny();
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  const digest = `sha256:${hash}`;
  const artifactId = `native-arguments:${hash}`;
  const recordId = `native-arguments:${createHash("sha256").update(`${workspaceId}\0${hash}`).digest("hex")}`;
  const locationRef = artifactId;
  const path = join(directory, "arguments", `${hash}.json`);
  const verifyFile = () => {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw deny();
    const saved = readFileSync(path);
    if (
      !saved.equals(bytes) ||
      createHash("sha256").update(saved).digest("hex") !== hash
    )
      throw deny();
  };
  const verifyRecord = () => {
    const observation = store.readSetupState(workspaceId);
    const rows = observation.records.filter(
      ({ kind, record }) => kind === "artifact" && record.recordId === recordId,
    );
    if (rows.length !== 1 || observation.deletedRecordIds.includes(recordId))
      throw deny();
    const record = rows[0].record;
    if (
      record.artifactId !== artifactId ||
      record.digest !== digest ||
      record.byteLength !== bytes.length ||
      record.mediaType !== "application/json" ||
      record.retentionClass !== "workspace" ||
      record.locationRef !== locationRef
    )
      throw deny();
    verifyFile();
  };
  assertCurrent();
  mkdirSync(join(directory, "arguments"), { recursive: true });
  try {
    writeFileSync(path, bytes, { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  verifyFile();
  const existing = store
    .readSetupState(workspaceId)
    .records.some(({ record }) => record.recordId === recordId);
  if (!existing)
    store.append(
      {
        kind: "artifact",
        record: {
          schemaVersion: 1,
          recordId,
          scopeId: workspaceId,
          createdAt: new Date().toISOString(),
          sourceIds: [],
          artifactId,
          digest,
          mediaType: "application/json",
          byteLength: bytes.length,
          retentionClass: "workspace",
          locationRef,
        },
      },
      caller,
    );
  verifyRecord();
  assertCurrent();
  return Object.freeze({
    artifactId,
    digest,
    semantic: snapshot,
    verify: verifyRecord,
    resolveReference(ref, scopeId) {
      if (ref !== artifactId || scopeId !== workspaceId) return false;
      verifyRecord();
      return true;
    },
  });
}

// One coherent Store observation supplies both the selected profile and its dependencies.
export function resolveNativeSessionSelection({
  store,
  profiles,
  workspaceId,
  profileId,
  profileRevision,
  directory,
}) {
  const state = store.readSetupState(workspaceId);
  if (!state.workspace || state.workspace.workspaceId !== workspaceId)
    throw unavailable();
  const deleted = new Set(state.deletedRecordIds);
  const rows = (kind, predicate) =>
    state.records.filter(
      ({ kind: k, record }) =>
        k === kind && !deleted.has(record.recordId) && predicate(record),
    );
  const one = (kind, predicate) => {
    const found = rows(kind, predicate);
    if (found.length !== 1) throw unavailable();
    return found[0].record;
  };
  const effective = profiles.effective(workspaceId, state);
  if (
    !effective ||
    effective.profileId !== profileId ||
    effective.profileRevision !== profileRevision ||
    !effective.generationReady
  )
    throw unavailable();
  const chats = effective.bindings.filter((binding) => binding.role === "chat");
  if (chats.length !== 1) throw unavailable();
  const chat = chats[0];
  const profile = one(
    "profileSnapshot",
    (r) => r.profileId === profileId && r.profileRevision === profileRevision,
  );
  const connection = one(
    "providerConnection",
    (r) =>
      r.providerConnectionId === chat.providerConnectionId &&
      r.revision === chat.connectionRevision,
  );
  const endpoint = one(
    "providerEndpoint",
    (r) => `${r.endpointId}@${r.revision}` === connection.endpointRef,
  );
  if (
    endpoint.apiFamily !== connection.apiFamily ||
    !["openai-completions", "openai-responses"].includes(endpoint.apiFamily) ||
    canonicalEndpointUrl(endpoint.canonicalUrl, endpoint.locality) !==
      endpoint.canonicalUrl ||
    connection.locality !==
      (endpoint.locality === "loopback" ? "local" : "hosted")
  )
    throw unavailable();
  function loadDescriptor(id) {
    const record = one("artifact", (r) => r.artifactId === id);
    const hash = (value) => createHash("sha256").update(value).digest("hex");
    if (
      record.recordId !==
        `native-descriptor:${hash(`${workspaceId}\0${id}`)}` ||
      record.scopeId !== workspaceId ||
      record.mediaType !== "application/json" ||
      record.retentionClass !== "workspace"
    )
      throw unavailable();
    const bytes = readFileSync(
      join(directory, "setup-descriptors", `${hash(record.recordId)}.json`),
    );
    if (bytes.length !== record.byteLength || hash(bytes) !== record.digest)
      throw unavailable();
    const value = JSON.parse(bytes.toString("utf8"));
    if (value.scopeId !== workspaceId || value.schemaVersion !== 1)
      throw unavailable();
    return value;
  }
  const account = loadDescriptor(connection.accountScopeRef);
  const limits = loadDescriptor(profile.limitsArtifactId);
  if (
    !isDeepStrictEqual(account, {
      schemaVersion: 1,
      scopeId: workspaceId,
      kind: "provider-account",
      accountScope: "provider-default",
    }) ||
    !isDeepStrictEqual(limits, {
      schemaVersion: 1,
      scopeId: workspaceId,
      kind: "provider-transport-limits",
      transport: "sse",
      maxRetries: 0,
      redirects: "denied",
      maxEncodedFrameBytes: TRANSPORT_LIMITS.maxEncodedFrameBytes,
      maxRequestBytes: 4194304,
      headersTimeoutMs: 10000,
      maxSseEventBytes: 1048576,
    }) ||
    profile.egressPolicyRefs.length !== 1 ||
    !isDeepStrictEqual(loadDescriptor(profile.egressPolicyRefs[0]), {
      schemaVersion: 1,
      scopeId: workspaceId,
      kind: "provider-egress",
      origin: originView(endpoint),
      requiresNativeGrant: true,
      grants: [],
    })
  )
    throw unavailable();
  const artifact = one(
    "artifact",
    (r) =>
      profile.sourceIds.includes(r.recordId) &&
      r.role === "chat" &&
      r.modelId === chat.modelId &&
      r.mediaType === "application/vnd.splyce.model-descriptor+json",
  );
  const descriptor = artifact.descriptor;
  const bytes = JSON.stringify(descriptor);
  if (
    !descriptor ||
    artifact.artifactId !== artifact.recordId ||
    artifact.retentionClass !== "workspace" ||
    artifact.byteLength !== Buffer.byteLength(bytes) ||
    artifact.digest !==
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`
  )
    throw unavailable();
  const keys = [
    "source",
    "contextWindow",
    "maxOutputTokens",
    "reasoning",
    "input",
    "costKnown",
    ...(descriptor.source === "catalog" ? ["catalogVersion"] : []),
  ];
  if (
    Object.keys(descriptor).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(descriptor, key)) ||
    !["user", "catalog"].includes(descriptor.source) ||
    !Number.isSafeInteger(descriptor.contextWindow) ||
    descriptor.contextWindow <= 0 ||
    descriptor.contextWindow > 2 ** 21 ||
    !Number.isSafeInteger(descriptor.maxOutputTokens) ||
    descriptor.maxOutputTokens <= 0 ||
    descriptor.maxOutputTokens > Math.min(descriptor.contextWindow, 2 ** 20) ||
    typeof descriptor.reasoning !== "boolean" ||
    !Array.isArray(descriptor.input) ||
    descriptor.input.length === 0 ||
    descriptor.input.some((item) => item !== "text" && item !== "image") ||
    new Set(descriptor.input).size !== descriptor.input.length ||
    typeof descriptor.costKnown !== "boolean"
  )
    throw unavailable();
  let metadata;
  if (descriptor.source === "catalog") {
    const catalog = lookupPinnedModel({
      apiFamily: endpoint.apiFamily,
      endpoint: endpoint.canonicalUrl,
      modelId: chat.modelId,
    });
    if (!catalog || !isDeepStrictEqual(catalog.descriptor, descriptor))
      throw unavailable();
    metadata = catalog.metadata;
  } else if (descriptor.costKnown !== false) throw unavailable();
  const model = {
    id: chat.modelId,
    name: metadata?.name ?? chat.modelId,
    api: endpoint.apiFamily,
    provider: connection.providerConnectionId,
    baseUrl: endpoint.canonicalUrl,
    reasoning: descriptor.reasoning,
    input: [...descriptor.input],
    ...(metadata?.compat ? { compat: structuredClone(metadata.compat) } : {}),
    cost:
      metadata && descriptor.costKnown
        ? structuredClone(metadata.cost)
        : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: descriptor.contextWindow,
    maxTokens: descriptor.maxOutputTokens,
  };
  return {
    state,
    effective,
    profile,
    connection,
    endpoint,
    descriptor: structuredClone(descriptor),
    limits,
    model,
  };
}

// Private host port; no session or provider object leaves preparation.
export function createNativeSessionFactory({
  store,
  profiles,
  control,
  directory,
}) {
  if (!(control instanceof NativeControl)) throw unavailable();
  const prepared = new WeakMap();
  const caller = {
    sessionId: "native-session-setup",
    configRevision: "cfg-0",
    profileRevision: "cfg-0",
    policyRevision: "cfg-0",
  };
  function replay(request) {
    const capture = store.prepareNativeSessionSetup("session.start", request);
    if (!capture.replay) throw unavailable();
    const committed = store.commitNativeSessionStart(
      capture,
      undefined,
      caller,
    );
    if (committed.result.readiness.code || !committed.branchAnchor)
      throw unavailable();
    store.assertNativeSessionStartCurrent({
      workspaceId: request.workspaceId,
      sessionId: committed.result.sessionId,
      sessionRevision: committed.result.sessionRevision,
    });
    return committed;
  }
  async function make(input, restored) {
    const selectionInput = {
      store,
      profiles,
      directory,
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      profileRevision: input.profileRevision,
    };
    const selected = resolveNativeSessionSelection(selectionInput);
    const deletionEpoch = store.deletionEpoch();
    const audit = store.audit();
    if (
      deletionEpoch !== store.deletionEpoch() ||
      deletionEpoch !== selected.state.deletionEpoch
    )
      throw unavailable();
    const deleted = new Set(audit.deletedRecordIds);
    const identity = () => {
      const stat = statSync(selected.state.workspace.canonicalPath, {
        bigint: true,
      });
      if (
        !stat.isDirectory() ||
        String(stat.dev) !== selected.state.workspace.volumeSerial ||
        String(stat.ino) !== selected.state.workspace.fileId
      )
        throw unavailable();
    };
    const stable = () => {
      identity();
      const current = resolveNativeSessionSelection(selectionInput);
      for (const key of [
        "effective",
        "profile",
        "connection",
        "endpoint",
        "descriptor",
        "model",
        "limits",
      ])
        if (!isDeepStrictEqual(current[key], selected[key]))
          throw unavailable();
      if (!isDeepStrictEqual(current.state.workspace, selected.state.workspace))
        throw unavailable();
      if (store.deletionEpoch() !== deletionEpoch) throw unavailable();
    };
    let lease, manager;
    let committed = restored?.committed;
    const checkCommitted = () => {
      if (committed)
        store.assertNativeSessionStartCurrent({
          workspaceId: input.workspaceId,
          sessionId: committed.result.sessionId,
          sessionRevision: committed.result.sessionRevision,
        });
    };
    let disposed = false;
    const owner = createSplyceOwner(() => {
      if (disposed) throw unavailable();
      stable();
      checkCommitted();
      lease?.assertCurrent();
    });
    try {
      stable();
      const sessionDir = join(
        directory,
        "sessions",
        createHash("sha256").update(input.workspaceId).digest("hex"),
      );
      if (restored) {
        if (!existsSync(sessionDir)) throw unavailable();
      } else mkdirSync(sessionDir, { recursive: true });
      const bindPersistence = (subject) =>
        owner.bindPersistence(
          subject,
          async (serialized, signal) =>
            (await control.redact(serialized, signal)).text,
        );
      if (restored) {
        const candidates = readdirSync(sessionDir).filter(
          (name) =>
            name.endsWith(`_${restored.piSessionId}.jsonl`) &&
            !name.includes("/") &&
            !name.includes("\\"),
        );
        if (candidates.length !== 1) throw unavailable();
        const file = join(sessionDir, candidates[0]);
        lease = acquireNativeSessionWriter(file);
        if (!lstatSync(file).isFile()) throw unavailable();
        manager = await SessionManager.openOwned(
          file,
          bindPersistence,
          sessionDir,
          selected.state.workspace.canonicalPath,
        );
      } else {
        manager = await SessionManager.createOwned(
          selected.state.workspace.canonicalPath,
          bindPersistence,
          sessionDir,
        );
      }
      stable();
      checkCommitted();
      const file = manager.getSessionFile();
      if (!file) throw unavailable();
      if (!restored) {
        if (existsSync(file)) throw unavailable();
        lease = acquireNativeSessionWriter(file);
        if (existsSync(file)) throw unavailable();
      }
      stable();
      const piSessionId = manager.getSessionId();
      if (restored && piSessionId !== restored.piSessionId) throw unavailable();
      const key = { scopeId: input.workspaceId, sessionId: piSessionId };
      const sessionMap = new SessionMap(store, {
        configRevision: selected.effective.configRevision,
        profileRevision: selected.effective.profileRevision,
        policyRevision: INITIAL_CONFIG_REVISION,
        resolveReference(ref, scopeId) {
          if (scopeId !== undefined && scopeId !== input.workspaceId)
            return false;
          if (ref === input.workspaceId || ref === manager.getSessionId())
            return true;
          if (manager.getEntries().some((entry) => entry.id === ref))
            return true;
          const scoped = audit.records.filter(
            ({ record }) => record.scopeId === input.workspaceId,
          );
          const direct = scoped.filter(
            ({ record }) =>
              record.recordId === ref || record.artifactId === ref,
          );
          if (direct.length)
            return (
              direct.length === 1 && !deleted.has(direct[0].record.recordId)
            );
          const anchors = scoped.filter(
            ({ kind, record }) =>
              kind === "branchAnchor" &&
              record.piSessionId === piSessionId &&
              record.branchAnchorId === ref,
          );
          return (
            anchors.length > 0 && !deleted.has(anchors.at(-1).record.recordId)
          );
        },
      });
      const preview = sessionMap.preview(key, manager);
      if (
        preview.piSessionId !== piSessionId ||
        preview.scopeId !== key.scopeId ||
        preview.sessionId !== key.sessionId ||
        preview.anchor?.piSessionId !== piSessionId
      )
        throw unavailable();
      const handle = Object.freeze({});
      const result = Object.freeze({
        piSessionId,
        branchAnchor: Object.freeze(
          structuredClone(restored?.branchAnchor ?? preview.anchor),
        ),
        handle,
      });
      prepared.set(handle, {
        result,
        manager,
        owner,
        lease,
        selectionInput,
        selected,
        stable,
        key,
        sessionMap,
        input,
        restored: !!restored,
        preview: structuredClone(preview.anchor),
        get committed() {
          return committed;
        },
        set committed(value) {
          committed = value;
        },
        dispose() {
          disposed = true;
        },
      });
      return result;
    } catch (error) {
      disposed = true;
      owner.dispose();
      lease?.close();
      if (restored && error?.code === "ENOENT") throw unavailable();
      throw error;
    }
  }
  async function prepare(input) {
    return make(input);
  }
  async function restore(input) {
    const observation = store.readSetupState(input.workspaceId);
    const receipts = observation.records.filter(
      ({ kind, record }) =>
        kind === "artifact" &&
        record.nativeSetup?.command === "session.start" &&
        record.nativeSetup.sessionId === input.piSessionId &&
        !observation.deletedRecordIds.includes(record.recordId),
    );
    if (receipts.length !== 1) throw unavailable();
    const request = receipts[0].record.nativeSetup.request;
    const committed = replay(request);
    if (
      committed.result.sessionId !== input.piSessionId ||
      !isDeepStrictEqual(committed.branchAnchor, input.branchAnchor)
    )
      throw unavailable();
    return make(
      {
        workspaceId: input.workspaceId,
        profileId: committed.profileId,
        profileRevision: committed.profileRevision,
        requestId: request.requestId,
      },
      { ...input, committed },
    );
  }
  async function bind(value) {
    const state = value && prepared.get(value.handle);
    if (!state || state.closed || state.result !== value) throw unavailable();
    state.stable();
    state.lease.assertCurrent();
    const request = {
      requestId: state.input.requestId,
      workspaceId: state.input.workspaceId,
      profileId: state.input.profileId,
      expectedConfigRevision: state.selected.effective.configRevision,
    };
    const committed = replay(request);
    if (
      committed.result.sessionId !== value.piSessionId ||
      !isDeepStrictEqual(committed.branchAnchor, value.branchAnchor)
    )
      throw unavailable();
    state.committed = committed;
    const current = state.sessionMap.preview(state.key, state.manager);
    if (!isDeepStrictEqual(current.anchor, state.preview)) throw unavailable();
    const before = store.cursor();
    try {
      const bound = state.sessionMap.bind(state.key, state.manager);
      if (
        !isDeepStrictEqual(bound.anchor, state.preview) ||
        (!state.restored && store.cursor() !== before)
      )
        throw unavailable();
      state.stable();
      state.lease.assertCurrent();
      store.assertNativeSessionStartCurrent({
        workspaceId: state.input.workspaceId,
        sessionId: committed.result.sessionId,
        sessionRevision: committed.result.sessionRevision,
      });
    } finally {
      state.sessionMap.dispose(state.key);
    }
    throw unavailable();
  }
  async function dispose(value) {
    const state = value && prepared.get(value.handle);
    if (!state || state.result !== value) throw unavailable();
    if (state.closed) return;
    state.closed = true;
    state.dispose();
    state.owner.dispose();
    state.lease.close();
  }
  return Object.freeze({ prepare, restore, bind, dispose });
}
