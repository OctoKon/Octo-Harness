import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertDriverProvenance,
  assertUnavailable,
  ownedBy,
  sameProcess,
} from "./release-smoke.mjs";

test("smoke assertion rejects fabricated readiness and missing unavailable UI", () => {
  const state = {
    connection: "unavailable",
    readiness: { policy: "false", store: "false", receipts: "false" },
    banner: true,
    ready: false,
  };
  assertUnavailable(state);
  for (const name of ["policy", "store", "receipts"]) {
    assert.throws(() =>
      assertUnavailable({
        ...state,
        readiness: { ...state.readiness, [name]: "true" },
      }),
    );
  }
  for (const broken of [
    { connection: "ready" },
    { banner: false },
    { ready: true },
    { readiness: undefined },
  ]) {
    assert.throws(() => assertUnavailable({ ...state, ...broken }));
  }
});

test("cleanup ownership excludes unrelated processes, cycles and reused PIDs", () => {
  const driver = { ProcessId: 10, ParentProcessId: 1, CreationDate: "first" };
  const app = { ProcessId: 20, ParentProcessId: 10, CreationDate: "first" };
  const engine = { ProcessId: 30, ParentProcessId: 20, CreationDate: "first" };
  const unrelated = { ProcessId: 40, ParentProcessId: 50 };
  const cycle = { ProcessId: 50, ParentProcessId: 40 };
  const list = [driver, app, engine, unrelated, cycle];
  assert(ownedBy(engine, driver.ProcessId, list));
  assert(!ownedBy(unrelated, driver.ProcessId, list));
  assert(!ownedBy(driver, driver.ProcessId, list));
  assert(sameProcess(engine, { ...engine }));
  assert(!sameProcess(engine, { ...engine, CreationDate: "replacement" }));
});

test("driver provenance rejects tampered bytes and mismatched versions", () => {
  const pin = {
    version: "2.1.0",
    crateSha256: "a".repeat(64),
  };
  const manifest = {
    schemaVersion: 1,
    tauriDriver: {
      version: pin.version,
      crateUrl: `https://crates.io/api/v1/crates/tauri-driver/${pin.version}/download`,
      crateSha256: pin.crateSha256,
      binarySha256: "b".repeat(64),
    },
    webview2: {
      distribution: "Evergreen",
      runtimeVersion: "155.0.4283.62",
    },
    edgeDriver: {
      version: "155.0.4283.62",
      sourcePage:
        "https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver",
      downloadUrl:
        "https://msedgedriver.microsoft.com/155.0.4283.62/edgedriver_win64.zip",
      archiveSha256: "c".repeat(64),
      binarySha256: "d".repeat(64),
    },
  };
  const actual = {
    tauriDriverSha256: manifest.tauriDriver.binarySha256,
    edgeArchiveSha256: manifest.edgeDriver.archiveSha256,
    edgeDriverSha256: manifest.edgeDriver.binarySha256,
    edgeDriverVersion: manifest.edgeDriver.version,
    runtimeVersion: manifest.webview2.runtimeVersion,
  };
  assertDriverProvenance(manifest, pin, actual);

  assert.throws(() =>
    assertDriverProvenance(
      {
        ...manifest,
        tauriDriver: {
          ...manifest.tauriDriver,
          crateUrl: "https://example.invalid/tauri-driver",
        },
      },
      pin,
      actual,
    ),
  );
  assert.throws(() =>
    assertDriverProvenance(manifest, pin, {
      ...actual,
      tauriDriverSha256: "e".repeat(64),
    }),
  );
  assert.throws(() =>
    assertDriverProvenance(manifest, pin, {
      ...actual,
      edgeDriverSha256: "f".repeat(64),
    }),
  );
  assert.throws(() =>
    assertDriverProvenance(manifest, pin, {
      ...actual,
      edgeArchiveSha256: "e".repeat(64),
    }),
  );
  assert.throws(() =>
    assertDriverProvenance(manifest, pin, {
      ...actual,
      edgeDriverVersion: "155.0.4284.1",
    }),
  );
  assert.throws(() =>
    assertDriverProvenance(manifest, pin, {
      ...actual,
      runtimeVersion: "155.0.4284.1",
    }),
  );
  assert.throws(() =>
    assertDriverProvenance(
      {
        ...manifest,
        edgeDriver: {
          ...manifest.edgeDriver,
          version: "155.0.4284.1",
          downloadUrl:
            "https://msedgedriver.microsoft.com/155.0.4284.1/edgedriver_win64.zip",
        },
      },
      pin,
      { ...actual, edgeDriverVersion: "155.0.4284.1" },
    ),
  );
});
