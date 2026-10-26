import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPinnedModelCatalog } from "./hydrate-pinned-model-data.mjs";

const bytes = Buffer.from('{"catalog":true}');
const revision = `sha256-${createHash("sha256").update(bytes).digest("hex")}`;

test("fetches and verifies the exact pinned model catalog", async () => {
  let requested;
  const result = await fetchPinnedModelCatalog(revision, async (url) => {
    requested = url;
    return new Response(bytes);
  });

  assert.equal(
    requested,
    `https://pi.dev/api/models/revisions/${revision}?types=chat,image,classifier`,
  );
  assert.deepEqual(result, bytes);
});

test("rejects invalid pins, unavailable revisions and tampered bytes", async () => {
  await assert.rejects(
    fetchPinnedModelCatalog("latest", async () => new Response()),
  );
  await assert.rejects(
    fetchPinnedModelCatalog(
      revision,
      async () => new Response(null, { status: 404 }),
    ),
    /unavailable: HTTP 404/,
  );
  await assert.rejects(
    fetchPinnedModelCatalog(revision, async () => new Response("tampered")),
    /do not match the revision/,
  );
});
