import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, toNamespacedPath } from "node:path";
import test from "node:test";
import { createNativeHost } from "../packages/splyce-pi/src/native-host.mjs";
import { Store } from "../packages/splyce-pi/dist/store.js";
import { validateEvent } from "../packages/splyce-pi/dist/contracts.js";

const fixtures = JSON.parse(
  readFileSync(
    new URL("./fixtures/contracts/records.json", import.meta.url),
    "utf8",
  ),
);
const caller = {
  sessionId: "s1",
  configRevision: "cfg-0",
  profileRevision: "cfg-0",
  policyRevision: "cfg-0",
  resolveReference: () => true,
};
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "splyce-native-host-"));
  const host = createNativeHost(directory);
  const path = join(directory, "splyce", "store.db");
  const writer = Store.open(path);
  t.after(() => {
    host.close();
    writer.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, path, host, writer };
}
function append(writer, kind, changes = {}) {
  writer.append({ kind, record: { ...fixtures[kind], ...changes } }, caller);
}
function code(expected) {
  return (error) => {
    assert.equal(error.code, expected);
    return true;
  };
}

test("private native factory opens persistent Store with every runnable port closed", (t) => {
  const { host, directory, writer } = fixture(t);
  assert.deepEqual(host.handshakeReadiness, {
    state: "ready",
    policy: true,
    store: true,
    receipts: true,
    ports: {
      generation: false,
      provider: false,
      workspace: false,
      modules: false,
    },
  });
  assert.deepEqual(host.current("w-demo"), {
    configRevision: "cfg-0",
    profileRevision: "cfg-0",
    policyRevision: "cfg-0",
    grantIds: [],
    planMode: true,
  });
  assert.deepEqual(host.listWorkspaces(), []);
  assert.equal(host.resolveWorkspace("w-demo"), undefined);
  assert.throws(() => host.resolveWorkspace("a/b"), code("NATIVE_INVALID_ID"));
  append(writer, "run");
  assert.deepEqual(host.current("w-demo").grantIds, []);
  assert.deepEqual(readdirSync(join(directory, "splyce", "snapshots")), []);
  host.close();
  const reopened = createNativeHost(toNamespacedPath(directory));
  try {
    assert.equal(writer.cursor(), 1);
    assert.deepEqual(reopened.current("w-demo").grantIds, []);
    assert.deepEqual(reopened.listWorkspaces(), []);
    assert.deepEqual(writer.audit().scopeIds, ["w-demo"]);
  } finally {
    reopened.close();
  }
});

test("current reloads profile/config while empty authority denies effects", (t) => {
  const { host, writer, directory } = fixture(t);
  append(writer, "profileSnapshot", { configRevision: "cfg-0" });
  const queued = host.current("w-demo", "p1");
  assert.equal(queued.profileRevision, "profile1");
  assert.throws(
    () => host.current("w-demo", "missing"),
    code("NATIVE_PROFILE_UNAVAILABLE"),
  );
  const target = join(directory, "target");
  writeFileSync(target, "unchanged");
  let effects = 0;
  const dispatch = () => {
    host.assertCurrent("w-demo", queued, "p1");
    effects++;
    writeFileSync(target, "changed");
  };
  assert.throws(dispatch, code("STALE_REVISION"));
  append(writer, "profileSnapshot", {
    recordId: "profile-new",
    profileRevision: "profile2",
    configRevision: "cfg-0",
  });
  assert.deepEqual(host.current("w-demo", "p1"), {
    configRevision: "cfg-0",
    profileRevision: "profile2",
    policyRevision: "cfg-0",
    grantIds: [],
    planMode: true,
  });
  assert.equal(host.current("w-demo", "p1").profileRevision, "profile2");
  append(writer, "configurationTransition", {
    expectedConfigRevision: "cfg-0",
  });
  assert.equal(host.current("w-demo").configRevision, "cfg2");
  assert.throws(
    () => host.current("w-demo", "p1"),
    code("NATIVE_PROFILE_STALE"),
  );
  append(writer, "profileSnapshot", {
    recordId: "profile-current",
    profileRevision: "profile3",
    configRevision: "cfg2",
  });
  assert.deepEqual(host.current("w-demo", "p1"), {
    configRevision: "cfg2",
    profileRevision: "profile3",
    policyRevision: "cfg-0",
    grantIds: [],
    planMode: true,
  });
  assert.equal(queued.configRevision, "cfg-0");
  assert.equal(queued.profileRevision, "profile1");
  assert.throws(dispatch, code("STALE_REVISION"));
  assert.equal(effects, 0);
  assert.equal(readFileSync(target, "utf8"), "unchanged");
  assert.equal(writer.cursor(), 4);
  assert.deepEqual(host.current("w-demo", "p1").grantIds, []);
});

test("tombstones preserve historical evidence without restoring authority", (t) => {
  const { host, writer, directory } = fixture(t);
  append(writer, "profileSnapshot", { configRevision: "cfg-0" });
  writer.noteDeletion("rec-profile");
  assert.equal(host.handshakeReadiness.store, true);
  assert.throws(
    () => host.current("w-demo", "p1"),
    code("NATIVE_PROFILE_UNAVAILABLE"),
  );
  assert.equal(writer.cursor(), 1);
  host.close();
  const reopened = createNativeHost(directory);
  try {
    assert.throws(
      () => reopened.current("w-demo", "p1"),
      code("NATIVE_PROFILE_UNAVAILABLE"),
    );
    assert.equal(writer.deletionEpoch(), 1);
  } finally {
    reopened.close();
  }
});

test("structural audit retains historical event references after deletion", (t) => {
  const { host, writer } = fixture(t);
  append(writer, "run", { recordId: "e1" });
  const { seq, ...draft } = fixtures.event.envelope;
  writer.commitEvents([], [draft], caller);
  writer.noteDeletion("e1");
  assert.equal(writer.audit().recordCount, 2);
  assert.equal(host.handshakeReadiness.store, true);
  assert.deepEqual(host.current("w-demo").grantIds, []);
  assert.throws(
    () => writer.replayEvents("w-demo", "s1"),
    code("UNRESOLVED_REFERENCE"),
  );
  assert.equal(writer.deletionEpoch(), 1);
});

test("historical migrated attribution remains intact", (t) => {
  const { host, writer } = fixture(t);
  append(writer, "run");
  writer.db.exec("UPDATE records SET session_id = ''");
  assert.equal(host.handshakeReadiness.store, true);
  assert.equal(writer.audit().recordCount, 1);
  assert.equal(writer.list("w-demo").records.length, 1);
  assert.equal(writer.list("w-demo", 0, "s1").records.length, 0);
});

test("deleted effective config is unavailable without changing its history", (t) => {
  const { host, writer } = fixture(t);
  append(writer, "configurationTransition", {
    expectedConfigRevision: "cfg-0",
  });
  writer.noteDeletion("rec-config");
  assert.throws(
    () => host.current("w-demo"),
    code("NATIVE_CONFIG_UNAVAILABLE"),
  );
  assert.equal(writer.configRevision("w-demo"), "cfg2");
  assert.equal(writer.cursor(), 1);
});

for (const [name, sql, expected] of [
  [
    "unknown schema",
    "UPDATE records SET schema_version = 99",
    "UNKNOWN_SCHEMA",
  ],
  [
    "unknown kind",
    "UPDATE records SET kind = 'futureKind'",
    "CONTRACT_UNKNOWN_KIND",
  ],
  ["corrupt payload", "UPDATE records SET payload = '{'", "STORE_CORRUPT"],
  [
    "invalid authority shape",
    "UPDATE records SET payload = json_remove(payload, '$.profileRevision')",
    "CONTRACT_INVALID_SHAPE",
  ],
  [
    "row attribution",
    "UPDATE records SET record_id = 'foreign'",
    "STORE_ATTRIBUTION",
  ],
]) {
  test(`${name} fails bootstrap and dynamic authority without resetting data`, (t) => {
    const { host, writer, directory } = fixture(t);
    append(writer, "profileSnapshot", { configRevision: "cfg-0" });
    writer.db.exec(sql);
    const before = writer.db.prepare("SELECT * FROM records").all();
    assert.throws(() => host.current("w-demo", "p1"), code(expected));
    assert.throws(() => host.handshakeReadiness, code(expected));
    assert.throws(() => createNativeHost(directory), code(expected));
    assert.deepEqual(writer.db.prepare("SELECT * FROM records").all(), before);
  });
}

test("path input must be an absolute native appdata path", () => {
  const invalid = [undefined, {}, "relative", "", "C:\\bad\0path", "\ud800"];
  if (process.platform === "win32")
    invalid.push(
      "\\\\server\\share",
      "\\\\?\\UNC\\server\\share",
      "\\\\.\\device",
      "\\\\?\\GLOBALROOT\\device",
      "C:relative",
      "\\rooted",
      "C:\\bad\ud800path",
    );
  for (const value of invalid)
    assert.throws(
      () => createNativeHost(value),
      code("NATIVE_APP_DATA_INVALID"),
    );
});

test("non-SQLite appdata Store is preserved and rejected", (t) => {
  const { host, writer, path, directory } = fixture(t);
  host.close();
  writer.close();
  writeFileSync(path, "not a SQLite store");
  assert.throws(() => createNativeHost(directory), code("STORE_CORRUPT"));
  assert.equal(readFileSync(path, "utf8"), "not a SQLite store");
});

test("closed host fails readiness and authority", (t) => {
  const { host } = fixture(t);
  host.close();
  assert.throws(() => host.handshakeReadiness, code("STORE_CLOSED"));
  assert.throws(() => host.current("w-demo"), code("STORE_CLOSED"));
});

function seedEvent(writer) {
  append(writer, "run", { recordId: "e1" });
  const { seq, ...draft } = fixtures.event.envelope;
  writer.commitEvents([], [draft], caller);
}

test("reopened protocol-1 SQLite history projects protocol 2 without rewriting payload bytes", (t) => {
  const { host, writer, path, directory } = fixture(t);
  seedEvent(writer);
  writer.db.exec(
    "UPDATE records SET payload = json_set(payload, '$.envelope.protocolVersion', 1) WHERE kind = 'event'",
  );
  const raw = writer.db
    .prepare("SELECT payload FROM records WHERE kind = 'event'")
    .get().payload;
  const expected = JSON.parse(raw);
  expected.envelope.protocolVersion = 2;
  host.close();
  writer.close();
  const reopened = Store.open(path);
  let factory;
  const imported = Store.open(join(directory, "import.db"));
  try {
    factory = createNativeHost(directory);
    assert.equal(factory.handshakeReadiness.store, true);
    assert.deepEqual(
      reopened.audit().records.find(({ kind }) => kind === "event").record,
      expected,
    );
    assert.deepEqual(reopened.get(expected.recordId).record, expected);
    assert.deepEqual(
      reopened.list("w-demo").records.find(({ kind }) => kind === "event")
        .record,
      expected,
    );
    assert.deepEqual(reopened.replayEvents("w-demo", "s1"), [
      expected.envelope,
    ]);
    assert.equal(
      reopened.eventHighwater("w-demo", "s1"),
      expected.envelope.seq,
    );
    const exportedPath = join(directory, "export.jsonl");
    assert.equal(reopened.exportJSONL(exportedPath), 2);
    assert.equal(imported.importJSONL(exportedPath, caller), 2);
    assert.deepEqual(imported.get(expected.recordId).record, expected);
    assert.equal(
      reopened.db
        .prepare("SELECT payload FROM records WHERE kind = 'event'")
        .get().payload,
      raw,
    );
    reopened.noteDeletion("e1");
    assert.equal(reopened.audit().recordCount, 2);
    assert.equal(factory.handshakeReadiness.store, true);
    assert.throws(
      () => reopened.replayEvents("w-demo", "s1"),
      code("UNRESOLVED_REFERENCE"),
    );
    assert.equal(
      reopened.db
        .prepare("SELECT payload FROM records WHERE kind = 'event'")
        .get().payload,
      raw,
    );
  } finally {
    imported.close();
    factory?.close();
    reopened.close();
  }
});

for (const version of [3, "1"]) {
  test(`stored event protocol ${JSON.stringify(version)} remains invalid`, (t) => {
    const { host, writer } = fixture(t);
    seedEvent(writer);
    writer.db
      .prepare(
        "UPDATE records SET payload = json_set(payload, '$.envelope.protocolVersion', ?) WHERE kind = 'event'",
      )
      .run(version);
    const raw = writer.db
      .prepare("SELECT payload FROM records WHERE kind = 'event'")
      .get().payload;
    assert.throws(() => writer.audit(), code("CONTRACT_UNSUPPORTED_VERSION"));
    assert.throws(
      () => host.handshakeReadiness,
      code("CONTRACT_UNSUPPORTED_VERSION"),
    );
    assert.throws(
      () => writer.get(fixtures.event.recordId),
      code("UNSUPPORTED_VERSION"),
    );
    assert.throws(() => writer.list("w-demo"), code("UNSUPPORTED_VERSION"));
    assert.throws(
      () => writer.replayEvents("w-demo", "s1"),
      code("UNSUPPORTED_VERSION"),
    );
    assert.equal(
      writer.db
        .prepare("SELECT payload FROM records WHERE kind = 'event'")
        .get().payload,
      raw,
    );
  });
}

test("protocol-1 live append and transport validation stay closed", (t) => {
  const { writer } = fixture(t);
  append(writer, "run", { recordId: "e1" });
  const legacy = {
    ...fixtures.event,
    envelope: { ...fixtures.event.envelope, protocolVersion: 1 },
  };
  const before = writer.cursor();
  assert.throws(
    () => writer.append({ kind: "event", record: legacy }, caller),
    code("EVENT_COMMIT_REQUIRED"),
  );
  const { seq, ...draft } = legacy.envelope;
  assert.throws(
    () => writer.commitEvents([], [draft], caller),
    code("CONTRACT_UNSUPPORTED_VERSION"),
  );
  assert.throws(
    () =>
      validateEvent(legacy.envelope, {
        ...caller,
        scopeId: "w-demo",
        lastDurableSeq: 1,
        maxInlineBytes: 65536,
      }),
    code("UNSUPPORTED_VERSION"),
  );
  assert.equal(writer.cursor(), before);
  assert.equal(writer.eventHighwater("w-demo", "s1"), 0);
});
