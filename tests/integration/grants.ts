// Splyce TD-13 (C2_grants_store): native admitted workspaces, append-only
// grants with atomic once-grant consumption, and canonical provider endpoints
// on the real Store (two handles / two processes on one file).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ContractError,
  canonicalEndpointUrl,
  originView,
} from "../../packages/splyce-pi/dist/contracts.js";
import { actionArgumentsDigest } from "../../packages/splyce-pi/dist/policy.js";
import {
  Store,
  StoreError,
  workspaceView,
} from "../../packages/splyce-pi/dist/store.js";

const caller = {
  sessionId: "s1",
  configRevision: "cfg-0",
  profileRevision: "p1",
  policyRevision: "policy1",
  resolveReference: () => true,
};
const PATH = "C:\\Users\\dev\\project-alpha";
const IDENTITY = { volumeSerial: "A1B2C3D4", fileId: "0x0001000000000abc" };
const DIGEST = actionArgumentsDigest({ path: "src/a.ts", content: "x" });
const code = (expected: string) => (error: unknown) =>
  error instanceof StoreError && error.code === expected;

function fixture(t: { after(callback: () => void): void }) {
  const dir = mkdtempSync(join(tmpdir(), "td13-grants-"));
  const path = join(dir, "store.db");
  const a = Store.open(path);
  const b = Store.open(path);
  t.after(() => {
    a.close();
    b.close();
    const target = resolve(dir);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith("td13-grants-"));
    rmSync(target, { recursive: true, force: true });
  });
  return { dir, path, a, b };
}

/** A real Pi-derived session record, as SessionMap.bind persists it. */
function bindSession(store: Store, piSessionId = "pi-1") {
  store.append(
    {
      kind: "branchAnchor",
      record: {
        schemaVersion: 1,
        recordId: `anchor-${piSessionId}.1`,
        createdAt: "2026-10-27T00:00:00.000Z",
        scopeId: "w1",
        sourceIds: [],
        branchAnchorId: `anchor-${piSessionId}`,
        piSessionId,
        parentAnchorId: null,
        forkPointEntryId: null,
        firstChildEntryId: null,
        activeLeafEntryId: null,
      },
    },
    caller,
  );
}

const action = (recordId: string, state: string, digest = DIGEST) => ({
  kind: "action" as const,
  record: {
    schemaVersion: 1,
    recordId,
    createdAt: "2026-10-27T00:00:01.000Z",
    scopeId: "w1",
    sourceIds: [],
    actionId: "action-1",
    runId: "run-1",
    parentActionId: null,
    capabilityId: "fs.write",
    capabilityVersion: "1",
    argumentsArtifactId: "args-1",
    targetScopeId: "w1",
    idempotencyKey: "key-1",
    state,
    argumentsDigest: digest,
  },
});
const approvedRunning = (prefix = "act") => [
  action(`${prefix}-approved`, "approved"),
  action(`${prefix}-running`, "running"),
];

function setup(store: Store) {
  bindSession(store);
  const workspace = store.admitWorkspace(
    { canonicalPath: PATH, ...IDENTITY },
    caller,
  );
  const once = store.mintGrant(
    {
      workspaceId: workspace.workspaceId,
      sessionId: "pi-1",
      capability: "fs.write",
      scope: "once",
      actionId: "action-1",
      argumentsDigest: DIGEST,
    },
    caller,
  );
  const use = {
    grantId: once.grantId,
    workspaceId: workspace.workspaceId,
    sessionId: "pi-1",
    capability: "fs.write" as const,
    actionId: "action-1",
    argumentsDigest: DIGEST,
    observedIdentity: IDENTITY,
  };
  return { workspace, once, use };
}

if (process.argv[2] === "crash-before-commit-child") {
  // Fault injection at the SQLite boundary: every row of the batch is
  // written, then the process hangs at COMMIT until the parent kills it.
  const store = Store.open(process.argv[3]!);
  const exec = store.db.exec.bind(store.db);
  store.db.exec = (sql: string) => {
    if (sql === "COMMIT;") {
      process.stdout.write("at-commit");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    }
    exec(sql);
  };
  store.consumeOnceGrant(
    JSON.parse(process.argv[4]!),
    approvedRunning("crash"),
    caller,
  );
}

if (process.argv[2] === "consume-child") {
  const store = Store.open(process.argv[3]!);
  let result;
  try {
    store.consumeOnceGrant(
      JSON.parse(process.argv[4]!),
      approvedRunning(`child-${String(process.pid)}`),
      caller,
    );
    result = { committed: true };
  } catch (error) {
    result = {
      committed: false,
      code: error instanceof StoreError ? error.code : String(error),
    };
  } finally {
    store.close();
  }
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

test("admission is idempotent for the same path and directory identity", (t) => {
  const { a, b } = fixture(t);
  const first = a.admitWorkspace({ canonicalPath: PATH, ...IDENTITY }, caller);
  const again = b.admitWorkspace({ canonicalPath: PATH, ...IDENTITY }, caller);
  assert.equal(again.workspaceId, first.workspaceId);
  assert.equal(first.displayName, "project-alpha");
  assert.equal(first.revision, "1");
  assert.equal(b.getWorkspace(first.workspaceId)?.canonicalPath, PATH);
  assert.equal(
    a
      .list(first.workspaceId)
      .records.filter((r) => r.kind === "admittedWorkspace").length,
    1,
  );
});

test("same path with a changed directory identity is denied until re-admitted", (t) => {
  const { a } = fixture(t);
  const { workspace, use } = setup(a);
  const changed = {
    canonicalPath: PATH,
    volumeSerial: IDENTITY.volumeSerial,
    fileId: "0x02",
  };
  const before = a.cursor();
  assert.throws(
    () => a.admitWorkspace(changed, caller),
    code("WORKSPACE_IDENTITY_CHANGED"),
  );
  assert.equal(a.cursor(), before);
  // A dispatch that observes a different directory is denied at consume.
  assert.throws(
    () =>
      a.consumeOnceGrant(
        { ...use, observedIdentity: { ...IDENTITY, fileId: "0x02" } },
        approvedRunning(),
        caller,
      ),
    code("WORKSPACE_IDENTITY_CHANGED"),
  );
  const readmitted = a.admitWorkspace(changed, caller, { readmit: true });
  assert.notEqual(readmitted.workspaceId, workspace.workspaceId);
  assert.equal(readmitted.revision, "2");
  // Grants on the superseded workspace stop working, even with the old identity.
  assert.throws(
    () => a.consumeOnceGrant(use, approvedRunning(), caller),
    code("WORKSPACE_IDENTITY_CHANGED"),
  );
  assert.equal(a.cursor(), before + 1);
});

test("UNC, device, verbatim, relative and non-canonical paths are rejected", (t) => {
  const { a } = fixture(t);
  for (const canonicalPath of [
    "\\\\server\\share\\repo",
    "\\\\?\\C:\\repo",
    "\\\\.\\C:\\repo",
    "\\\\.\\pipe\\x",
    "repo",
    ".\\repo",
    "C:repo",
    "C:/Users/dev",
    "/home/dev",
    "C:\\Users\\..\\Windows",
    "C:\\Users\\dev\\",
    "C:\\Users\\NUL",
    "C:\\Users\\dev.",
  ])
    assert.throws(
      () => a.admitWorkspace({ canonicalPath, ...IDENTITY }, caller),
      code("WORKSPACE_PATH_INVALID"),
      canonicalPath,
    );
  assert.throws(
    () =>
      a.admitWorkspace(
        { canonicalPath: PATH, ...IDENTITY, extra: 1 } as never,
        caller,
      ),
    code("WORKSPACE_INPUT"),
  );
  assert.equal(a.cursor(), 0);
});

test("an fs.read session grant cannot be minted without a real Pi session", (t) => {
  const { a } = fixture(t);
  const workspace = a.admitWorkspace(
    { canonicalPath: PATH, ...IDENTITY },
    caller,
  );
  const read = {
    workspaceId: workspace.workspaceId,
    sessionId: "pi-1",
    capability: "fs.read" as const,
    scope: "session" as const,
  };
  const before = a.cursor();
  assert.throws(() => a.mintGrant(read, caller), code("SESSION_UNKNOWN"));
  assert.equal(a.cursor(), before);
  bindSession(a);
  const grant = a.mintGrant(read, caller);
  assert.equal(
    a.requireGrant({
      ...read,
      grantId: grant.grantId,
      observedIdentity: IDENTITY,
    }).grantId,
    grant.grantId,
  );
  assert.throws(
    () => a.mintGrant({ ...read, workspaceId: "ws-unknown" }, caller),
    code("WORKSPACE_NOT_ADMITTED"),
  );
});

test("write and shell need a once grant; session grants and missing grants are denied", (t) => {
  const { a } = fixture(t);
  const { workspace, use } = setup(a);
  for (const capability of ["fs.write", "shell.run"] as const)
    assert.throws(
      () =>
        a.mintGrant(
          {
            workspaceId: workspace.workspaceId,
            sessionId: "pi-1",
            capability,
            scope: "session",
          },
          caller,
        ),
      code("CONTRACT_INVALID_SHAPE"),
    );
  const read = a.mintGrant(
    {
      workspaceId: workspace.workspaceId,
      sessionId: "pi-1",
      capability: "fs.read",
      scope: "session",
    },
    caller,
  );
  const before = a.cursor();
  assert.throws(
    () =>
      a.consumeOnceGrant(
        { ...use, grantId: "grant-missing" },
        approvedRunning(),
        caller,
      ),
    code("GRANT_REQUIRED"),
  );
  assert.throws(
    () =>
      a.consumeOnceGrant(
        { ...use, grantId: read.grantId },
        approvedRunning(),
        caller,
      ),
    code("GRANT_MISMATCH"),
  );
  assert.equal(a.cursor(), before);
});

test("a consumed once grant cannot be reused and the reuse appends nothing", (t) => {
  const { a, b } = fixture(t);
  const { use } = setup(a);
  const { seqs } = a.consumeOnceGrant(use, approvedRunning(), caller);
  assert.equal(seqs.length, 3);
  const before = b.cursor();
  assert.throws(
    () => b.consumeOnceGrant(use, approvedRunning("again"), caller),
    code("GRANT_CONSUMED"),
  );
  assert.equal(b.cursor(), before);
  assert.throws(() => b.get("again-running"), code("STORE_NOT_FOUND"));
});

test("a revoked grant is denied for consume and session use", (t) => {
  const { a, b } = fixture(t);
  const { workspace, use } = setup(a);
  b.revokeGrant(use.grantId, caller);
  const before = a.cursor();
  assert.throws(
    () => a.consumeOnceGrant(use, approvedRunning(), caller),
    code("GRANT_REVOKED"),
  );
  assert.throws(
    () => a.revokeGrant(use.grantId, caller),
    code("GRANT_REVOKED"),
  );
  assert.equal(a.cursor(), before);
  const read = {
    workspaceId: workspace.workspaceId,
    sessionId: "pi-1",
    capability: "fs.read" as const,
    scope: "session" as const,
  };
  const grant = a.mintGrant(read, caller);
  a.revokeGrant(grant.grantId, caller);
  assert.throws(
    () =>
      a.requireGrant({
        ...read,
        grantId: grant.grantId,
        observedIdentity: IDENTITY,
      }),
    code("GRANT_REVOKED"),
  );
});

test("a mismatched digest, action, session or capability is denied without appending", (t) => {
  const { a } = fixture(t);
  const { use } = setup(a);
  const before = a.cursor();
  const other = actionArgumentsDigest({ path: "src/a.ts", content: "y" });
  for (const wrong of [
    { argumentsDigest: other },
    { actionId: "action-2" },
    { sessionId: "pi-2" },
    { capability: "shell.run" as const },
  ])
    assert.throws(
      () => a.consumeOnceGrant({ ...use, ...wrong }, approvedRunning(), caller),
      code("GRANT_MISMATCH"),
      JSON.stringify(wrong),
    );
  // The running receipt must carry the grant's digest too.
  assert.throws(
    () =>
      a.consumeOnceGrant(
        use,
        [
          action("x-approved", "approved", other),
          action("x-running", "running", other),
        ],
        caller,
      ),
    code("GRANT_MISMATCH"),
  );
  // Consumption without the running receipt is never allowed.
  assert.throws(
    () => a.consumeOnceGrant(use, [action("y-approved", "approved")], caller),
    code("GRANT_MISMATCH"),
  );
  assert.equal(a.cursor(), before);
  a.consumeOnceGrant(use, approvedRunning(), caller);
});

test("two processes consuming the same once grant: exactly one wins", async (t) => {
  const { path, a } = fixture(t);
  const { use } = setup(a);
  const run = () =>
    new Promise<{ committed: boolean; code?: string }>((done, fail) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          "consume-child",
          path,
          JSON.stringify(use),
        ],
        { stdio: ["ignore", "pipe", "inherit"] },
      );
      let out = "";
      child.stdout.on("data", (chunk) => (out += String(chunk)));
      child.on("error", fail);
      child.on("exit", () => done(JSON.parse(out)));
    });
  const results = await Promise.all([run(), run(), run()]);
  assert.equal(
    results.filter((r) => r.committed).length,
    1,
    JSON.stringify(results),
  );
  for (const r of results.filter((r) => !r.committed))
    assert.equal(r.code, "GRANT_CONSUMED");
  const running = a
    .list("w1")
    .records.filter(
      (r) =>
        r.kind === "action" &&
        (r.record as { state: string }).state === "running",
    );
  assert.equal(running.length, 1);
});

test("receipt and consume are atomic: a failed receipt leaves neither", (t) => {
  const { path, a } = fixture(t);
  const { use } = setup(a);
  a.append(action("taken", "proposed"), caller);
  const before = a.cursor();
  // The running receipt collides mid-batch; the whole transaction rolls back.
  assert.throws(
    () =>
      a.consumeOnceGrant(
        use,
        [action("act-approved", "approved"), action("taken", "running")],
        caller,
      ),
    code("STORE_SQLITE_ERROR"),
  );
  assert.equal(a.cursor(), before);
  const raw = new DatabaseSync(path, { readOnly: true });
  const leftovers = raw
    .prepare("SELECT COUNT(*) AS n FROM records WHERE record_id IN (?, ?)")
    .get("act-approved", `${use.grantId}.consumed`)!.n;
  raw.close();
  assert.equal(leftovers, 0);
  // The grant is still usable exactly once afterwards.
  a.consumeOnceGrant(use, approvedRunning(), caller);
  assert.throws(
    () => a.consumeOnceGrant(use, approvedRunning("z"), caller),
    code("GRANT_CONSUMED"),
  );
});

test("a crash before commit leaves neither the running receipt nor the consumption", async (t) => {
  const { path, a } = fixture(t);
  const { use } = setup(a);
  const before = a.cursor();
  await new Promise<void>((done, fail) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(import.meta.url),
        "crash-before-commit-child",
        path,
        JSON.stringify(use),
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("at-commit")) child.kill("SIGKILL");
    });
    child.on("error", fail);
    child.on("exit", (exitCode, signal) =>
      signal === "SIGKILL" ? done() : fail(new Error(`exit ${exitCode}`)),
    );
  });
  const reopened = Store.open(path);
  try {
    assert.equal(reopened.cursor(), before);
    assert.throws(() => reopened.get("crash-running"), code("STORE_NOT_FOUND"));
    assert.throws(
      () => reopened.get(`${use.grantId}.consumed`),
      code("STORE_NOT_FOUND"),
    );
    reopened.consumeOnceGrant(use, approvedRunning(), caller);
  } finally {
    reopened.close();
  }
  assert.throws(
    () => a.consumeOnceGrant(use, approvedRunning("late"), caller),
    code("GRANT_CONSUMED"),
  );
});

test("providerEndpoint is writable only through compareAndAppend", (t) => {
  const { a } = fixture(t);
  const record = {
    schemaVersion: 1,
    recordId: "ex",
    createdAt: "2026-10-27T00:00:00.000Z",
    scopeId: "w1",
    sourceIds: [],
    endpointId: "endpoint1",
    canonicalUrl: "https://api.example.com/v1",
    apiFamily: "openai-completions",
    locality: "hosted",
    revision: "r1",
  };
  const input = { kind: "providerEndpoint" as const, record };
  const before = a.cursor();
  assert.throws(() => a.append(input, caller), code("NATIVE_API_REQUIRED"));
  assert.throws(
    () => a.appendBatch([input], caller),
    code("NATIVE_API_REQUIRED"),
  );
  assert.throws(
    () => a.commitEvents([input], [], caller),
    code("NATIVE_API_REQUIRED"),
  );
  assert.equal(a.cursor(), before);
  a.compareAndAppend(input, caller, {
    kind: "providerEndpoint",
    scopeId: "w1",
    entityId: "endpoint1",
    expectedRevision: null,
  });
  assert.equal(
    a.resolveEndpoint("w1", "endpoint1", "r1"),
    "https://api.example.com/v1",
  );
});
test("grant and workspace records are written only through their Store APIs", (t) => {
  const { a } = fixture(t);
  const { once } = setup(a);
  const forged = { ...once, recordId: "forged", grantId: "forged" };
  assert.throws(
    () => a.append({ kind: "grant", record: forged }, caller),
    code("NATIVE_API_REQUIRED"),
  );
  assert.throws(
    () => a.appendBatch([{ kind: "grant", record: forged }], caller),
    code("NATIVE_API_REQUIRED"),
  );
  assert.throws(
    () =>
      a.commitEvents(
        [{ kind: "admittedWorkspace", record: forged }],
        [],
        caller,
      ),
    code("NATIVE_API_REQUIRED"),
  );
  assert.throws(
    () =>
      a.mintGrant(
        {
          workspaceId: once.workspaceId,
          sessionId: "pi-1",
          capability: "fs.read",
          scope: "session",
          extra: 1,
        } as never,
        caller,
      ),
    code("CONTRACT_INVALID_SHAPE"),
  );
  assert.throws(
    () =>
      a.mintGrant(
        {
          workspaceId: once.workspaceId,
          sessionId: "p".repeat(129),
          capability: "net.provider",
          scope: "session",
          origin: "https://api.example.com:443",
        },
        caller,
      ),
    code("CONTRACT_INVALID_SHAPE"),
  );
  assert.throws(
    () =>
      a.mintGrant(
        {
          workspaceId: once.workspaceId,
          sessionId: "pi 1",
          capability: "fs.read",
          scope: "session",
        },
        caller,
      ),
    code("CONTRACT_INVALID_SHAPE"),
  );
});

test("the renderer projection and every exportable record omit the canonical path", (t) => {
  const { dir, path, a } = fixture(t);
  const { workspace } = setup(a);
  const view = workspaceView(workspace);
  assert.deepEqual(Object.keys(view).sort(), [
    "admittedAt",
    "displayName",
    "revision",
    "workspaceId",
  ]);
  assert.ok(!JSON.stringify(view).includes("Users"));
  const exported = join(dir, "export.jsonl");
  a.exportJSONL(exported);
  assert.ok(!readFileSync(exported, "utf8").includes("project-alpha\\"));
  assert.ok(!readFileSync(exported, "utf8").includes("Users"));
  const raw = new DatabaseSync(path, { readOnly: true });
  const leaked = raw
    .prepare("SELECT COUNT(*) AS n FROM records WHERE payload LIKE '%Users%'")
    .get()!.n;
  raw.close();
  assert.equal(leaked, 0);
  assert.equal(a.getWorkspace(workspace.workspaceId)?.canonicalPath, PATH);
});

test("net.provider grants are origin-scoped, minted without a session and revoked on profile change", (t) => {
  const { a } = fixture(t);
  const workspace = a.admitWorkspace(
    { canonicalPath: PATH, ...IDENTITY },
    caller,
  );
  const base = {
    workspaceId: workspace.workspaceId,
    sessionId: "pi-9",
    capability: "net.provider" as const,
    scope: "session" as const,
  };
  for (const origin of [
    "https://api.example.com",
    "https://api.example.com:443/v1",
    "http://api.example.com:80",
    "https://user@api.example.com:443",
    "HTTPS://API.EXAMPLE.COM:443",
    "ftp://api.example.com:21",
  ])
    assert.throws(
      () => a.mintGrant({ ...base, origin }, caller),
      code("CONTRACT_INVALID_SHAPE"),
      origin,
    );
  assert.throws(
    () => a.mintGrant(base, caller),
    code("CONTRACT_INVALID_SHAPE"),
  );
  const hosted = a.mintGrant(
    { ...base, origin: "https://api.example.com:443" },
    caller,
  );
  const local = a.mintGrant(
    { ...base, origin: "http://127.0.0.1:11434" },
    caller,
  );
  assert.equal(a.revokeProviderGrants(workspace.workspaceId, caller), 2);
  assert.equal(a.revokeProviderGrants(workspace.workspaceId, caller), 0);
  for (const grant of [hosted, local])
    assert.throws(
      () =>
        a.requireGrant({
          ...base,
          grantId: grant.grantId,
          observedIdentity: IDENTITY,
        }),
      code("GRANT_REVOKED"),
    );
});

test("canonical endpoint URLs: https hosted, http loopback only, no userinfo/query/fragment", () => {
  const invalid = (error: unknown) =>
    error instanceof ContractError && error.code === "INVALID_ENDPOINT";
  for (const [url, locality] of [
    ["https://user:pw@api.example.com/v1", "hosted"],
    ["https://@api.example.com", "hosted"],
    ["https://api.example.com/v1#frag", "hosted"],
    ["https://api.example.com/v1?key=x", "hosted"],
    ["https://api.example.com/v1?", "hosted"],
    ["http://api.example.com/v1", "hosted"],
    ["http://api.example.com/v1", "loopback"],
    ["https://localhost/v1", "hosted"],
    ["http://10.0.0.5:8080", "loopback"],
    ["https://api.example.com/a/../v1", "hosted"],
    ["https://api.example.com/%2e%2e/v1", "hosted"],
    ["https://api.example.com/v1//chat", "hosted"],
    ["https://api.example.com\\v1", "hosted"],
    [" https://api.example.com", "hosted"],
    ["api.example.com/v1", "hosted"],
    ["file:///C:/x", "hosted"],
  ])
    assert.throws(
      () => canonicalEndpointUrl(url, locality),
      invalid,
      `${url} ${locality}`,
    );
  assert.equal(
    canonicalEndpointUrl("HTTPS://API.Example.COM:443/v1/", "hosted"),
    "https://api.example.com/v1",
  );
  assert.equal(
    canonicalEndpointUrl("https://api.example.com", "hosted"),
    "https://api.example.com",
  );
  assert.equal(
    canonicalEndpointUrl("http://localhost:11434/", "loopback"),
    "http://localhost:11434",
  );
  assert.equal(
    canonicalEndpointUrl("http://127.0.0.1:80/api", "loopback"),
    "http://127.0.0.1/api",
  );
  assert.equal(
    canonicalEndpointUrl("http://[::1]:8080/v1", "loopback"),
    "http://[::1]:8080/v1",
  );
  assert.equal(
    originView({ canonicalUrl: "https://api.example.com/v1" }),
    "https://api.example.com:443",
  );
  assert.equal(
    originView({ canonicalUrl: "http://localhost:11434/v1" }),
    "http://localhost:11434",
  );
  assert.equal(
    originView({ canonicalUrl: "http://[::1]/v1" }),
    "http://[::1]:80",
  );
});

test("providerEndpoint records are canonical, CAS-revisioned and resolve at a pinned revision", (t) => {
  const { a, b } = fixture(t);
  const endpoint = (
    recordId: string,
    revision: string,
    canonicalUrl = "https://api.example.com/v1",
  ) => ({
    schemaVersion: 1,
    recordId,
    createdAt: "2026-10-27T00:00:00.000Z",
    scopeId: "w1",
    sourceIds: [],
    endpointId: "endpoint1",
    canonicalUrl,
    apiFamily: "openai-completions",
    locality: "hosted",
    revision,
  });
  const guard = (expectedRevision: string | null) => ({
    kind: "providerEndpoint" as const,
    scopeId: "w1",
    entityId: "endpoint1",
    expectedRevision,
  });
  assert.throws(
    () =>
      a.compareAndAppend(
        {
          kind: "providerEndpoint",
          record: endpoint("e0", "r1", "https://API.example.com/v1/"),
        },
        caller,
        guard(null),
      ),
    code("CONTRACT_INVALID_ENDPOINT"),
  );
  assert.throws(
    () =>
      a.compareAndAppend(
        {
          kind: "providerEndpoint",
          record: { ...endpoint("e0", "r1"), extra: 1 },
        },
        caller,
        guard(null),
      ),
    code("CONTRACT_INVALID_SHAPE"),
  );
  a.compareAndAppend(
    { kind: "providerEndpoint", record: endpoint("e1", "r1") },
    caller,
    guard(null),
  );
  b.compareAndAppend(
    {
      kind: "providerEndpoint",
      record: endpoint("e2", "r2", "https://api2.example.com/v1"),
    },
    caller,
    guard("r1"),
  );
  const before = a.cursor();
  assert.throws(
    () =>
      a.compareAndAppend(
        { kind: "providerEndpoint", record: endpoint("e3", "r3") },
        caller,
        guard("r1"),
      ),
    code("ENTITY_STALE_REVISION"),
  );
  assert.equal(a.cursor(), before);
  assert.equal(
    a.resolveEndpoint("w1", "endpoint1", "r1"),
    "https://api.example.com/v1",
  );
  assert.equal(
    b.resolveEndpoint("w1", "endpoint1", "r2"),
    "https://api2.example.com/v1",
  );
  assert.throws(
    () => a.resolveEndpoint("w1", "endpoint1", "r9"),
    code("ENDPOINT_UNKNOWN"),
  );
});
