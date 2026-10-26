import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateEvent } from "@splyce/pi/contracts";

const context = {
  scopeId: "w-demo",
  sessionId: "ses_test_01",
  configRevision: "cfg1",
  profileRevision: "profile1",
  policyRevision: "policy1",
  lastDurableSeq: 12,
  maxInlineBytes: 4096,
  resolveReference: () => true,
};

for (const file of [
  "fui-w3-accessibility.json",
  "fui-w4-stream-backpressure.json",
  "fui-w5-approval-race.json",
]) {
  test(`TD-34: GUI fixture ${file} conforms to frozen contract v1`, () => {
    const content = JSON.parse(
      readFileSync(new URL(`./fixtures/gui/${file}`, import.meta.url), "utf8"),
    );
    assert.equal(content.schemaVersion, 1);
    for (const step of content.eventSequence) {
      const ctx = {
        ...context,
        sessionId: step.event.sessionId,
        scopeId: step.event.scopeId,
      };
      const validated = validateEvent(step.event, ctx);
      assert.deepEqual(validated, step.event);
    }
  });
}
