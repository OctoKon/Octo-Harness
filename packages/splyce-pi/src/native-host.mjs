import { mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { RevisionFence } from "../dist/admission.js";
import { ConfigAuthority } from "../dist/config.js";
import { createProviderProfiles } from "../dist/provider-profiles.js";
import { Receipts } from "../dist/receipts.js";
import { createNativeProviderSetup } from "./native-provider-setup.mjs";
import { createNativeSessionSetup } from "./native-session-setup.mjs";
import {
  INITIAL_CONFIG_REVISION,
  Store,
  workspaceView,
} from "../dist/store.js";

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
export function createNativeHost(appDataDir, nativeControl, sessionFactory) {
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
  const profiles = createProviderProfiles({ store, config });
  const providerSetup = createNativeProviderSetup(store, directory);
  const sessions = createNativeSessionSetup({
    store,
    control: nativeControl,
    factory: sessionFactory,
  });
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
    const observation = store.readAuthority(scopeId);
    const { records, deletedRecordIds } = observation;
    const applied = records.filter(
      ({ kind, record }) =>
        kind === "configurationTransition" && record.state === "applied",
    );
    const latest = applied.at(-1)?.record;
    const selected = applied.findLast(
      ({ record }) => record.profileId !== undefined,
    )?.record;
    if (
      [latest, selected].some(
        (record) => record && deletedRecordIds.includes(record.recordId),
      )
    )
      fail("NATIVE_CONFIG_UNAVAILABLE");
    const revision = latest?.acceptedConfigRevision ?? INITIAL_CONFIG_REVISION;
    if (profileId !== undefined && selected?.profileId !== profileId)
      fail(selected ? "NATIVE_PROFILE_STALE" : "NATIVE_PROFILE_UNAVAILABLE");
    if (selected) {
      const snapshot = records.find(
        ({ kind, record }) =>
          kind === "profileSnapshot" &&
          record.profileId === selected.profileId &&
          record.profileRevision === selected.profileRevision,
      );
      if (!snapshot || deletedRecordIds.includes(snapshot.record.recordId))
        fail("NATIVE_PROFILE_UNAVAILABLE");
    }
    const effective = profiles.effective(scopeId, observation);
    const profileRevision =
      effective?.profileRevision ?? INITIAL_CONFIG_REVISION;
    // This host has no runnable grant dispatch; history never creates authority.
    return new RevisionFence(
      { effectiveRevision: () => revision },
      {
        scopeId,
        profileRevision,
        policyRevision: INITIAL_CONFIG_REVISION,
        grantIds: [],
        planMode: true,
      },
    );
  }

  return Object.freeze({
    get handshakeReadiness() {
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
      return store.listWorkspaceViews();
    },
    admitWorkspace(input) {
      return workspaceView(
        store.admitWorkspace(input, {
          sessionId: "native-workspace-admission",
          configRevision: INITIAL_CONFIG_REVISION,
          profileRevision: INITIAL_CONFIG_REVISION,
          policyRevision: INITIAL_CONFIG_REVISION,
        }),
      );
    },
    resolveWorkspace(id) {
      opaqueId(id);
      return store
        .listWorkspaces()
        .find(({ workspaceId }) => workspaceId === id);
    },
    prepareProviderSetup: providerSetup.prepare,
    commitProviderSetup: providerSetup.commit,
    readProviderSetup: providerSetup.read,
    selectProfile(input, requestId, signal) {
      return sessions.handle("profile.select", input, requestId, signal);
    },
    startSession(input, requestId, signal) {
      return sessions.handle("session.start", input, requestId, signal);
    },
    async shutdown() {
      try {
        await sessions.close();
      } finally {
        store.close();
      }
    },
    close() {
      if (sessionFactory) fail("NATIVE_ASYNC_SHUTDOWN_REQUIRED");
      store.close();
    },
  });
}
