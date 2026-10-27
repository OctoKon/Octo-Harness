import { mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { RevisionFence } from "../dist/admission.js";
import { ConfigAuthority } from "../dist/config.js";
import { Receipts } from "../dist/receipts.js";
import { INITIAL_CONFIG_REVISION, Store } from "../dist/store.js";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function opaqueId(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    /\s|[\\/]/u.test(value)
  )
    fail("NATIVE_INVALID_ID");
}

// Private entrypoint: only Rust's first bootstrap frame supplies this path.
export function createNativeHost(appDataDir) {
  if (
    typeof appDataDir !== "string" ||
    !isAbsolute(appDataDir) ||
    !appDataDir.isWellFormed() ||
    appDataDir.includes("\0") ||
    (process.platform === "win32" &&
      !/^[A-Za-z]:[\\/]/u.test(appDataDir.replace(/^\\\\\?\\/u, "")))
  )
    fail("NATIVE_APP_DATA_INVALID");
  if (process.platform === "win32")
    appDataDir = appDataDir.replace(/^\\\\\?\\/u, "");
  const directory = join(appDataDir, "splyce");
  mkdirSync(directory, { recursive: true });
  const store = Store.open(join(directory, "store.db"));
  const config = new ConfigAuthority(store);
  const receipts = new Receipts(store);
  try {
    store.audit();
    receipts.durableCursor();
    mkdirSync(join(directory, "snapshots"), { recursive: true });
  } catch (error) {
    store.close();
    throw error;
  }

  function fence(scopeId, profileId) {
    opaqueId(scopeId);
    if (profileId !== undefined) opaqueId(profileId);
    const audit = store.audit();
    const records = audit.records.filter(
      ({ record }) => record.scopeId === scopeId,
    );
    const transition = records.findLast(
      ({ kind, record }) =>
        kind === "configurationTransition" && record.state === "applied",
    );
    if (
      transition !== undefined &&
      audit.deletedRecordIds.includes(transition.record.recordId)
    )
      fail("NATIVE_CONFIG_UNAVAILABLE");
    const revision = config.effectiveRevision(scopeId);
    let profileRevision = INITIAL_CONFIG_REVISION;
    if (profileId !== undefined) {
      const latest = records.findLast(
        ({ kind, record }) =>
          kind === "profileSnapshot" && record.profileId === profileId,
      );
      if (
        latest === undefined ||
        audit.deletedRecordIds.includes(latest.record.recordId)
      )
        fail("NATIVE_PROFILE_UNAVAILABLE");
      if (latest.record.configRevision !== revision)
        fail("NATIVE_PROFILE_STALE");
      profileRevision = latest.record.profileRevision;
    }
    // No policy/grant record kind exists yet; history never creates authority.
    return new RevisionFence(config, {
      scopeId,
      profileRevision,
      policyRevision: INITIAL_CONFIG_REVISION,
      grantIds: [],
      planMode: true,
    });
  }

  return Object.freeze({
    get handshakeReadiness() {
      store.audit();
      receipts.durableCursor();
      return Object.freeze({
        state: "ready",
        policy: true,
        store: true,
        receipts: true,
        ports: Object.freeze({
          generation: false,
          provider: false,
          workspace: false,
          modules: false,
        }),
      });
    },
    current(scopeId, profileId) {
      return fence(scopeId, profileId).current();
    },
    assertCurrent(scopeId, queued, profileId) {
      fence(scopeId, profileId).assertCurrent(queued);
    },
    listWorkspaces() {
      store.audit();
      return [];
    },
    resolveWorkspace(id) {
      opaqueId(id);
      store.audit();
      return undefined;
    },
    close() {
      store.close();
    },
  });
}
