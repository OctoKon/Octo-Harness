import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertDriverProvenance,
  assertUnavailable,
  ownedBy,
  sameProcess,
  sanitizeSmokeDiagnostics,
  webviewDebuggingFlags,
} from "./release-smoke.mjs";

test("WebView debugging diagnostics expose only valid ports and pipe flags", () => {
  assert.deepEqual(
    webviewDebuggingFlags(
      '"C:\\Users\\private-user\\browser.exe" --remote-debugging-port=9222 --remote-debugging-pipe private-credential',
    ),
    { port: 9222, pipe: true },
  );
  assert.deepEqual(webviewDebuggingFlags('--remote-debugging-port "0"'), {
    port: 0,
    pipe: false,
  });
  for (const command of [
    "--remote-debugging-port=65536",
    "--remote-debugging-port=-1",
    "--remote-debugging-port=12invalid",
    "--unrelated-remote-debugging-port=9222",
    "",
  ]) {
    assert.deepEqual(webviewDebuggingFlags(command), {
      port: null,
      pipe: false,
    });
  }
});

test("public smoke diagnostics retain the failed request and omit private data", () => {
  const diagnostic = sanitizeSmokeDiagnostics(
    {
      case: "bootstrap-unavailable-release",
      passed: false,
      sessionRequestElapsedMs: 20001,
      webviewDebugging: {
        declaredPorts: [9222],
        pipe: false,
        endpoints: [
          { host: "127.0.0.1", port: 9222, status: 200, devtools: true },
        ],
      },
      failureProcesses: {
        nativeDriverStarted: true,
        applicationStarted: false,
        applicationWindowStarted: false,
      },
      pins: { webview2: "155.0.4283.62" },
      failedRequest: {
        method: "POST",
        path: "/session/private-session/execute/sync",
      },
      error:
        "Timeout at C:\\Users\\private-user\\Splyce\\smoke.mjs:1\nAuthorization: Bearer private-credential",
      app: "C:\\Users\\private-user\\app.exe",
      failureState: { text: "private-workspace-text" },
      ownedProcesses: [{ ExecutablePath: "private-process" }],
    },
    "driver C:\\Users\\private-user\\driver.exe\ntoken=private-credential\nPOST /session/private-session/execute/sync",
  );
  const result = JSON.parse(diagnostic.result);
  assert.equal(result.passed, false);
  assert.equal(result.sessionRequestElapsedMs, 20001);
  assert.equal(result.webviewDebugging.endpoints[0].devtools, true);
  assert.deepEqual(result.failureProcesses, {
    nativeDriverStarted: true,
    applicationStarted: false,
    applicationWindowStarted: false,
  });
  assert.equal(result.pins.webview2, "155.0.4283.62");
  assert.deepEqual(result.failedRequest, {
    method: "POST",
    path: "/session/<session>/execute/sync",
  });
  for (const value of [diagnostic.result, diagnostic.driverLog]) {
    assert.doesNotMatch(
      value,
      /private-user|private-credential|private-workspace-text|private-process|private-session/,
    );
  }
  assert.equal(result.app, undefined);
  assert.equal(result.failureState, undefined);
  assert.equal(result.ownedProcesses, undefined);
});

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
      registryScope: "user",
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
    runtimeScope: manifest.webview2.registryScope,
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
    assertDriverProvenance(manifest, pin, {
      ...actual,
      runtimeScope: "machine",
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
