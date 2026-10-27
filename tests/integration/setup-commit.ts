// Splyce TD-26: atomic first-run setup commit on the real Store.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateSetupMetadata } from "../../packages/splyce-pi/dist/setup-metadata.js";
import { Store, StoreError } from "../../packages/splyce-pi/dist/store.js";

// Every setup targets a real admitted workspace; fixture() sets it.
let W = "w1";
const base = {
  sessionId: "s1",
  configRevision: "cfg-0",
  profileRevision: "p1",
  policyRevision: "policy1",
};
// The codebase has no account/limits/egress/credential descriptor kinds, so each
// descriptor is a real stored `artifact` record and refs resolve against the Store.
const DESCRIPTORS = ["cred1", "acct-default", "limits1", "egress1"];
const artifact = (recordId: string) => ({
  schemaVersion: 1,
  recordId,
  createdAt: "2026-10-27T00:00:00.000Z",
  scopeId: W,
  sourceIds: [],
  artifactId: recordId,
  digest: "sha256:" + "0".repeat(64),
  mediaType: "application/json",
  byteLength: 2,
  retentionClass: "workspace",
});
// The pure validator is Store-independent: it throws its own SETUP_INVALID error.
const invalid = (error: unknown) =>
  (error as { code?: string } | null)?.code === "SETUP_INVALID";
const code = (expected: string) => (error: unknown) =>
  error instanceof StoreError && error.code === expected;

const input = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: W,
  requestId: "req1",
  endpoint: {
    endpointId: "ep1",
    canonicalUrl: "https://api.example.com/v1",
    apiFamily: "openai-completions",
    locality: "hosted",
    revision: "e1",
  },
  connection: {
    providerConnectionId: "conn1",
    revision: "c1",
    apiFamily: "openai-completions",
    locality: "hosted",
    endpointRef: "ep1@e1",
    credentialRef: "cred1",
  },
  profile: {
    profileId: "profile1",
    profileRevision: "p1",
    bindings: [
      {
        role: "chat",
        providerConnectionId: "conn1",
        connectionRevision: "c1",
        modelId: "gpt-x",
      },
    ],
  },
  descriptors: {
    accountScopeRef: "acct-default",
    limitsArtifactId: "limits1",
    apiVersion: "v1",
    adapterRevision: "adapter1",
    egressPolicyRefs: ["egress1"],
  },
  expected: {
    endpointRevision: null,
    connectionRevision: null,
    profileRevision: null,
  },
  ...overrides,
});

function fixture(t: { after(callback: () => void): void }) {
  const dir = mkdtempSync(join(tmpdir(), "td26-setup-"));
  const path = join(dir, "store.db");
  const store = Store.open(path);
  const caller = {
    ...base,
    resolveReference: (id: string, scopeId: string) =>
      store.list(scopeId).records.some(({ record }) => record.recordId === id),
  };
  const admitted = store.admitWorkspace(
    { canonicalPath: join(dir, "ws"), volumeSerial: "1", fileId: "2" },
    caller,
  );
  W = admitted.workspaceId;
  for (const id of DESCRIPTORS)
    store.append({ kind: "artifact", record: artifact(id) }, caller);
  t.after(() => {
    store.close();
    const target = resolve(dir);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith("td26-setup-"));
    rmSync(target, { recursive: true, force: true });
  });
  return { path, store, caller, dir };
}
const kinds = (store: Store) =>
  store
    .list(W)
    .records.map(({ kind }) => kind)
    .filter((kind) => kind !== "artifact" && kind !== "admittedWorkspace");

if (process.argv[2] === "setup-child") {
  W = process.argv[4]!;
  const store = Store.open(process.argv[3]!);
  const childCaller = {
    ...base,
    resolveReference: (id: string, scopeId: string) =>
      store.list(scopeId).records.some(({ record }) => record.recordId === id),
  };
  let result;
  try {
    const done = store.commitSetup(input(), childCaller);
    result = {
      ok: true,
      ids: [done.endpoint, done.connection, done.profile].map(
        (r) => r.recordId,
      ),
    };
  } catch (error) {
    result = {
      ok: false,
      code: error instanceof StoreError ? error.code : String(error),
    };
  } finally {
    store.close();
  }
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

test("create path appends endpoint, connection and profile atomically", (t) => {
  const { store, caller } = fixture(t);
  const result = store.commitSetup(input(), caller);
  assert.equal(result.endpoint.endpointId, "ep1");
  assert.equal(result.connection.endpointRef, "ep1@e1");
  assert.equal(result.connection.credentialRef, "cred1");
  assert.equal(result.profile.bindings?.[0]?.modelId, "gpt-x");
  assert.deepEqual(kinds(store).sort(), [
    "profileSnapshot",
    "providerConnection",
    "providerEndpoint",
  ]);
});

test("a failure mid-batch rolls back every record", (t) => {
  const { path, store, caller } = fixture(t);
  const raw = new DatabaseSync(path);
  raw.exec(
    "CREATE TRIGGER boom BEFORE INSERT ON records WHEN NEW.kind = 'profileSnapshot' BEGIN SELECT RAISE(ABORT, 'boom'); END;",
  );
  raw.close();
  const before = store.cursor();
  assert.throws(() => store.commitSetup(input(), caller));
  assert.equal(store.cursor(), before);
  assert.deepEqual(kinds(store), []);
});

for (const [name, expected] of [
  ["endpoint", { endpointRevision: "e0" }],
  ["connection", { connectionRevision: "c0" }],
  ["profile", { profileRevision: "p0" }],
] as const) {
  test(`stale expected ${name} revision appends nothing`, (t) => {
    const { store, caller } = fixture(t);
    const before = store.cursor();
    assert.throws(
      () =>
        store.commitSetup(
          input({
            expected: {
              endpointRevision: null,
              connectionRevision: null,
              profileRevision: null,
              ...expected,
            },
          }),
          caller,
        ),
      code("ENTITY_STALE_REVISION"),
    );
    assert.equal(store.cursor(), before);
    assert.deepEqual(kinds(store), []);
  });
}

test("an identical retry is idempotent and appends nothing", (t) => {
  const { store, caller } = fixture(t);
  const first = store.commitSetup(input(), caller);
  const cursor = store.cursor();
  const second = store.commitSetup(input(), caller);
  assert.deepEqual(second, first);
  assert.equal(store.cursor(), cursor);
  assert.equal(kinds(store).length, 3);
});

test("the same requestId with a different payload conflicts", (t) => {
  const { store, caller } = fixture(t);
  store.commitSetup(input(), caller);
  const cursor = store.cursor();
  const changed = input();
  changed.profile.bindings[0]!.modelId = "gpt-y";
  assert.throws(
    () => store.commitSetup(changed, caller),
    code("SETUP_REQUEST_CONFLICT"),
  );
  assert.equal(store.cursor(), cursor);
});

test("a second request revises all three entities against the stored revisions", (t) => {
  const { store, caller } = fixture(t);
  store.commitSetup(input(), caller);
  const next = input({
    requestId: "req2",
    endpoint: { ...input().endpoint, revision: "e2" },
    connection: {
      ...input().connection,
      revision: "c2",
      endpointRef: "ep1@e2",
    },
    profile: {
      profileId: "profile1",
      profileRevision: "p2",
      bindings: [{ ...input().profile.bindings[0]!, connectionRevision: "c2" }],
    },
    expected: {
      endpointRevision: "e1",
      connectionRevision: "c1",
      profileRevision: "p1",
    },
  });
  assert.equal(store.commitSetup(next, caller).profile.profileRevision, "p2");
  assert.equal(kinds(store).length, 6);
});

test("binding that references another connection revision is rejected", (t) => {
  const { store, caller } = fixture(t);
  const bad = input();
  bad.profile.bindings[0]!.connectionRevision = "c9";
  assert.throws(() => store.commitSetup(bad, caller), code("SETUP_INVALID"));
  assert.deepEqual(kinds(store), []);
});

test("connection endpointRef must name this endpoint revision", (t) => {
  const { store, caller } = fixture(t);
  const bad = input();
  bad.connection.endpointRef = "ep1@e9";
  assert.throws(() => store.commitSetup(bad, caller), code("SETUP_INVALID"));
});

test("missing modelId and non-canonical URL are rejected", (t) => {
  const { store, caller } = fixture(t);
  const noModel = input();
  delete (noModel.profile.bindings[0] as Record<string, unknown>).modelId;
  assert.throws(
    () => store.commitSetup(noModel, caller),
    code("SETUP_INVALID"),
  );
  const slash = input();
  slash.endpoint.canonicalUrl = "https://API.example.com/v1/";
  assert.throws(() => store.commitSetup(slash, caller), code("SETUP_INVALID"));
  assert.deepEqual(kinds(store), []);
});

test("raw secret fields are rejected at every level", (t) => {
  const { store, caller } = fixture(t);
  const top = { ...input(), apiKey: "sk-live-123" };
  assert.throws(() => store.commitSetup(top, caller), code("SETUP_INVALID"));
  const nested = input();
  (nested.connection as Record<string, unknown>).apiKey = "sk-live-123";
  assert.throws(() => store.commitSetup(nested, caller), code("SETUP_INVALID"));
  assert.deepEqual(kinds(store), []);
});

test("an unresolvable descriptor or credential ref appends nothing", (t) => {
  const { store, caller } = fixture(t);
  const cursor = store.cursor();
  const cases: [string, Record<string, unknown>][] = [
    [
      "descriptors.accountScopeRef",
      {
        descriptors: {
          ...input().descriptors,
          accountScopeRef: "acct-missing",
        },
      },
    ],
    [
      "descriptors.limitsArtifactId",
      {
        descriptors: {
          ...input().descriptors,
          limitsArtifactId: "limits-missing",
        },
      },
    ],
    [
      "descriptors.egressPolicyRefs[0]",
      {
        descriptors: {
          ...input().descriptors,
          egressPolicyRefs: ["egress-missing"],
        },
      },
    ],
    [
      "connection.credentialRef",
      { connection: { ...input().connection, credentialRef: "cred-missing" } },
    ],
  ];
  for (const [field, override] of cases)
    assert.throws(
      () => store.commitSetup(input(override), caller),
      (error: unknown) =>
        error instanceof StoreError &&
        error.code === "SETUP_INVALID" &&
        error.message.includes(field),
    );
  assert.equal(store.cursor(), cursor);
  assert.deepEqual(kinds(store), []);
});

test("a caller without a resolver cannot commit setup", (t) => {
  const { store } = fixture(t);
  assert.throws(
    () => store.commitSetup(input(), { ...base }),
    code("SETUP_INVALID"),
  );
  assert.deepEqual(kinds(store), []);
});

test("descriptors are required, strict and persisted as supplied", (t) => {
  const { store, caller } = fixture(t);
  const { descriptors: _omit, ...without } = input();
  assert.throws(
    () => store.commitSetup(without, caller),
    code("SETUP_INVALID"),
  );
  assert.throws(
    () =>
      store.commitSetup(
        input({ descriptors: { ...input().descriptors, extra: "x" } }),
        caller,
      ),
    code("SETUP_INVALID"),
  );
  const result = store.commitSetup(input(), caller);
  assert.equal(result.connection.accountScopeRef, "acct-default");
  assert.equal(result.connection.apiVersion, "v1");
  assert.equal(result.connection.adapterRevision, "adapter1");
  assert.equal(result.profile.limitsArtifactId, "limits1");
  assert.deepEqual(result.profile.egressPolicyRefs, ["egress1"]);
});

test("two real processes racing the identical request: one appends, the other replays", async (t) => {
  const { store, path } = fixture(t);
  const run = () =>
    new Promise<{ ok: boolean; code?: string; ids?: string[] }>(
      (resolve, reject) => {
        const child = spawn(
          process.execPath,
          [fileURLToPath(import.meta.url), "setup-child", path, W],
          {
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
          },
        );
        let out = "";
        let err = "";
        child.stdout.on("data", (d) => (out += String(d)));
        child.stderr.on("data", (d) => (err += String(d)));
        child.on("error", reject);
        child.on("close", (exit) => {
          if (exit !== 0)
            return reject(new Error(`child exit ${exit}: ${err}`));
          try {
            resolve(JSON.parse(out));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
  const results = await Promise.all([run(), run()]);
  assert.deepEqual(
    results.map((r) => r.ok),
    [true, true],
  );
  assert.deepEqual(results[0]!.ids, results[1]!.ids);
  assert.equal(kinds(store).length, 3);
});

test("model references with namespaces, versions and ARNs are accepted and persisted", (t) => {
  const forms = [
    "org/model:version",
    "vendor/model",
    "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-v2:1",
  ];
  for (const [i, modelId] of forms.entries()) {
    const { store, caller } = fixture(t);
    const value = input({ requestId: `req-model-${i}` });
    value.profile.bindings[0]!.modelId = modelId;
    const done = store.commitSetup(value, caller);
    assert.equal(
      store.get(done.profile.recordId).record.bindings[0].modelId,
      modelId,
    );
  }
});

test("control and format characters in modelId are rejected", (t) => {
  const { store, caller } = fixture(t);
  for (const modelId of ["gpt\u200bx", "gpt\u0007x", "gpt x", ""]) {
    const value = input();
    value.profile.bindings[0]!.modelId = modelId;
    assert.throws(
      () => store.commitSetup(value, caller),
      code("SETUP_INVALID"),
    );
  }
  assert.deepEqual(kinds(store), []);
});

test("the same requestId with any different accepted field conflicts", (t) => {
  const { store, caller } = fixture(t);
  store.commitSetup(input(), caller);
  const cursor = store.cursor();
  const changes: Record<string, unknown>[] = [
    { expected: { ...input().expected, endpointRevision: "e0" } },
    { descriptors: { ...input().descriptors, apiVersion: "v2" } },
    { connection: { ...input().connection, credentialRef: "acct-default" } },
  ];
  for (const change of changes)
    assert.throws(
      () => store.commitSetup(input(change), caller),
      code("SETUP_REQUEST_CONFLICT"),
    );
  assert.equal(store.cursor(), cursor);
});

test("displayName and unknown api families are rejected", (t) => {
  const { store, caller } = fixture(t);
  const named = input();
  (named.connection as Record<string, unknown>).displayName = "Example";
  assert.throws(() => store.commitSetup(named, caller), code("SETUP_INVALID"));
  const other = input();
  other.endpoint.apiFamily = "anthropic";
  other.connection.apiFamily = "anthropic";
  assert.throws(() => store.commitSetup(other, caller), code("SETUP_INVALID"));
  assert.deepEqual(kinds(store), []);
});

test("requestId, apiVersion and adapterRevision are bounded, plain and secret-free", (t) => {
  const { store, caller } = fixture(t);
  // Assembled at runtime so the fixture file never contains a key-shaped literal.
  const bad = [
    ["s", "k-ant-api03-abcdefghijklmnop"].join(""),
    ["gh", "p_abcdefghijklmnopqrstuvwxyz"].join(""),
    ["AK", "IAABCDEFGHIJKLMNOP"].join(""),
    "x".repeat(65),
    "has space",
    "semi;colon",
  ];
  for (const value of bad) {
    if (!["x".repeat(65), "semi;colon"].includes(value))
      assert.throws(
        () => store.commitSetup(input({ requestId: value }), caller),
        code("SETUP_INVALID"),
      );
    for (const field of ["apiVersion", "adapterRevision"])
      assert.throws(
        () =>
          store.commitSetup(
            input({ descriptors: { ...input().descriptors, [field]: value } }),
            caller,
          ),
        code("SETUP_INVALID"),
      );
  }
  assert.deepEqual(kinds(store), []);
});

test("a descriptor that stops resolving between check and commit cannot commit", (t) => {
  const { store, caller } = fixture(t);
  // The descriptor resolves for the pre-checks, then disappears before the write lock is held.
  let calls = 0;
  const flaky = {
    ...caller,
    resolveReference: (id: string, scopeId: string) =>
      id === "limits1" ? ++calls <= 2 : caller.resolveReference(id, scopeId),
  };
  const cursor = store.cursor();
  assert.throws(
    () => store.commitSetup(input(), flaky),
    (error: unknown) =>
      error instanceof StoreError &&
      error.code === "SETUP_INVALID" &&
      error.message.includes("descriptors.limitsArtifactId"),
  );
  assert.equal(store.cursor(), cursor);
  assert.deepEqual(kinds(store), []);
});

test("requestId is opaque up to 128 characters and still rejects secret shapes", (t) => {
  const { store, caller } = fixture(t);
  const secret = ["s", "k-ant-api03-abcdefghijklmnop"].join("");
  for (const bad of ["x".repeat(129), "a b", "a/b", "a\\b", "a\u0007b", secret])
    assert.throws(
      () => store.commitSetup(input({ requestId: bad }), caller),
      code("SETUP_INVALID"),
    );
  assert.deepEqual(kinds(store), []);
  store.commitSetup(input({ requestId: "r".repeat(128) }), caller);
  assert.equal(kinds(store).length, 3);
});

test("setup into a workspace superseded between prepare and commit is rejected", (t) => {
  const { store, caller, dir } = fixture(t);
  let superseded = false;
  const racing = {
    ...caller,
    resolveReference: (id: string, scopeId: string) => {
      if (!superseded) {
        superseded = true;
        store.admitWorkspace(
          { canonicalPath: join(dir, "ws"), volumeSerial: "1", fileId: "3" },
          caller,
          { readmit: true },
        );
      }
      return caller.resolveReference(id, scopeId);
    },
  };
  const cursor = store.cursor();
  assert.throws(
    () => store.commitSetup(input(), racing),
    (error: unknown) =>
      error instanceof StoreError &&
      error.code === "SETUP_INVALID" &&
      error.message.includes("workspace"),
  );
  assert.equal(superseded, true);
  assert.deepEqual(kinds(store), []);
  assert.equal(
    store.list(W).records.some(({ kind }) => kind === "providerEndpoint"),
    false,
  );
  assert.ok(store.cursor() > cursor, "only the re-admission was appended");
});

test("an unadmitted workspace cannot receive setup", (t) => {
  const { store, caller } = fixture(t);
  assert.throws(
    () => store.commitSetup(input({ workspaceId: "ws-unknown" }), caller),
    code("SETUP_INVALID"),
  );
});

test("readSetupState returns scoped setup records and the current workspace in one read", (t) => {
  const { store, caller, dir } = fixture(t);
  store.commitSetup(input(), caller);
  const state = store.readSetupState(W);
  assert.deepEqual([...new Set(state.records.map(({ kind }) => kind))].sort(), [
    "admittedWorkspace",
    "artifact",
    "profileSnapshot",
    "providerConnection",
    "providerEndpoint",
  ]);
  assert.deepEqual(state.deletedRecordIds, []);
  assert.equal(state.workspace?.workspaceId, W);
  assert.equal(state.workspace?.canonicalPath, join(dir, "ws"));
  assert.equal(state.workspace?.volumeSerial, "1");
  assert.equal(state.workspace?.fileId, "2");
});

test("readSetupState reports no workspace once it is superseded", (t) => {
  const { store, caller, dir } = fixture(t);
  store.admitWorkspace(
    { canonicalPath: join(dir, "ws"), volumeSerial: "1", fileId: "3" },
    caller,
    { readmit: true },
  );
  const state = store.readSetupState(W);
  assert.equal(state.workspace, null);
  assert.equal(store.readSetupState("ws-unknown").workspace, null);
});

// Shared fixtures: the pure validator and commitSetup must agree on every case.
const clone = () => structuredClone(input());
type Case = [string, (value: ReturnType<typeof input>) => void, boolean];
const secretLike = ["s", "k-ant-api03-abcdefghijklmnop"].join("");
const METADATA_CASES: Case[] = [
  ["baseline", () => {}, true],
  ["requestId 128", (v) => void (v.requestId = "r".repeat(128)), true],
  [
    "bedrock arn model",
    (v) =>
      void (v.profile.bindings[0]!.modelId =
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-v2:1"),
    true,
  ],
  ["requestId 129", (v) => void (v.requestId = "r".repeat(129)), false],
  ["requestId secret shape", (v) => void (v.requestId = secretLike), false],
  [
    "non-canonical url",
    (v) => void (v.endpoint.canonicalUrl = "https://API.example.com/v1/"),
    false,
  ],
  [
    "unknown api family",
    (v) => {
      v.endpoint.apiFamily = "anthropic";
      v.connection.apiFamily = "anthropic";
    },
    false,
  ],
  ["locality mismatch", (v) => void (v.connection.locality = "local"), false],
  [
    "model with format char",
    (v) => void (v.profile.bindings[0]!.modelId = "gpt​x"),
    false,
  ],
  [
    "binding wrong connection revision",
    (v) => void (v.profile.bindings[0]!.connectionRevision = "c9"),
    false,
  ],
  [
    "endpointRef mismatch",
    (v) => void (v.connection.endpointRef = "ep1@e9"),
    false,
  ],
  [
    "apiVersion with space",
    (v) => void (v.descriptors.apiVersion = "v 1"),
    false,
  ],
  [
    "adapterRevision too long",
    (v) => void (v.descriptors.adapterRevision = "a".repeat(65)),
    false,
  ],
  [
    "adapterRevision secret shape",
    (v) => void (v.descriptors.adapterRevision = secretLike),
    false,
  ],
  [
    "raw key field",
    (v) => void ((v.connection as Record<string, unknown>).apiKey = secretLike),
    false,
  ],
  [
    "displayName",
    (v) => void ((v.connection as Record<string, unknown>).displayName = "x"),
    false,
  ],
];

test("validateSetupMetadata and commitSetup accept and reject the same cases", (t) => {
  for (const [name, mutate, valid] of METADATA_CASES) {
    const { store, caller } = fixture(t);
    const value = clone();
    mutate(value);
    if (valid) {
      assert.doesNotThrow(() => validateSetupMetadata(value), name);
      assert.doesNotThrow(() => store.commitSetup(value, caller), name);
    } else {
      assert.throws(() => validateSetupMetadata(value), invalid, name);
      assert.throws(
        () => store.commitSetup(value, caller),
        code("SETUP_INVALID"),
        name,
      );
    }
  }
});

test("the pure validator accepts a pending credential slot; commitSetup still requires one", (t) => {
  const { store, caller } = fixture(t);
  const omitted = clone();
  delete (omitted.connection as Record<string, unknown>).credentialRef;
  const nulled = clone();
  (nulled.connection as Record<string, unknown>).credentialRef = null;
  for (const value of [omitted, nulled]) {
    const meta = validateSetupMetadata(value, { credentialPending: true });
    assert.equal(meta.connection.credentialRef, null);
    assert.throws(() => validateSetupMetadata(value), invalid);
    assert.throws(
      () => store.commitSetup(value, caller),
      code("SETUP_INVALID"),
    );
  }
  // Pending still validates everything else.
  const bad = clone();
  delete (bad.connection as Record<string, unknown>).credentialRef;
  bad.profile.bindings[0]!.modelId = "gpt​x";
  assert.throws(
    () => validateSetupMetadata(bad, { credentialPending: true }),
    invalid,
  );
  assert.deepEqual(kinds(store), []);
});
