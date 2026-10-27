import assert from "node:assert/strict";
import test from "node:test";
import { revisionFence } from "../../packages/splyce-pi/src/revision-fence.ts";

test("TD-14: revisionFence implemented", () => {
  assert.throws(() => revisionFence("a", "b"), /not implemented/);
});
