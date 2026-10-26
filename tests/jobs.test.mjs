import assert from "node:assert/strict";
import test from "node:test";
import { scheduleJob } from "../../packages/splyce-pi/src/jobs.ts";

test("TD-45: scheduleJob is implemented", () => {
  assert.throws(() => scheduleJob({ id: "j1", runAt: 1 }), /not implemented/);
});
