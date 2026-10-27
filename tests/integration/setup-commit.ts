// Splyce TD-26: atomic first-run setup commit on the real Store.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { Store, StoreError } from "../../packages/splyce-pi/dist/store.js";

const caller = {
  sessionId: "s1",
  configRevision: "cfg-0",
  profileRevision: "p1",
  policyRevision: "policy1",
  resolveReference: () => true,
};
const code = (expected: string) => (error: unknown) =>
  error instanceof StoreError && error.code === expected;

const input = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: "w1",
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
    displayName: "Example",
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
  t.after(() => {
    store.close();
    const target = resolve(dir);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith("td26-setup-"));
    rmSync(target, { recursive: true, force: true });
  });
  return { path, store };
}
const kinds = (store: Store) =>
  store.list("w1").records.map(({ kind }) => kind);

test("create path appends endpoint, connection and profile atomically", (t) => {
  const { store } = fixture(t);
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
  const { path, store } = fixture(t);
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
    const { store } = fixture(t);
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
  const { store } = fixture(t);
  const first = store.commitSetup(input(), caller);
  const cursor = store.cursor();
  const second = store.commitSetup(input(), caller);
  assert.deepEqual(second, first);
  assert.equal(store.cursor(), cursor);
  assert.equal(kinds(store).length, 3);
});

test("the same requestId with a different payload conflicts", (t) => {
  const { store } = fixture(t);
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
  const { store } = fixture(t);
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
  const { store } = fixture(t);
  const bad = input();
  bad.profile.bindings[0]!.connectionRevision = "c9";
  assert.throws(() => store.commitSetup(bad, caller), code("SETUP_INVALID"));
  assert.deepEqual(kinds(store), []);
});

test("connection endpointRef must name this endpoint revision", (t) => {
  const { store } = fixture(t);
  const bad = input();
  bad.connection.endpointRef = "ep1@e9";
  assert.throws(() => store.commitSetup(bad, caller), code("SETUP_INVALID"));
});

test("missing modelId and non-canonical URL are rejected", (t) => {
  const { store } = fixture(t);
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
  const { store } = fixture(t);
  const top = { ...input(), apiKey: "sk-live-123" };
  assert.throws(() => store.commitSetup(top, caller), code("SETUP_INVALID"));
  const nested = input();
  (nested.connection as Record<string, unknown>).apiKey = "sk-live-123";
  assert.throws(() => store.commitSetup(nested, caller), code("SETUP_INVALID"));
  assert.deepEqual(kinds(store), []);
});
