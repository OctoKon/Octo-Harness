import { test } from "node:test";
import assert from "node:assert/strict";
import { assertUnavailable, ownedBy, sameProcess } from "./release-smoke.mjs";

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
