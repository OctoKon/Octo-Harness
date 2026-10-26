import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hydrateModelCatalogBytes } from "../../vendor/pi/scripts/update-model-catalog-pin.mjs";

export async function fetchPinnedModelCatalog(revision, fetchImpl = fetch) {
  if (!/^sha256-[0-9a-f]{64}$/.test(revision))
    throw new Error("Invalid pinned model catalog revision.");
  const response = await fetchImpl(
    `https://pi.dev/api/models/revisions/${revision}?types=chat,image,classifier`,
  );
  if (!response.ok)
    throw new Error(
      `Pinned model catalog is unavailable: HTTP ${response.status}`,
    );
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
  if (actual !== revision)
    throw new Error("Pinned model catalog bytes do not match the revision.");
  return bytes;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const pin = JSON.parse(
    readFileSync(join(root, "vendor/pi/nix/model-catalog.json"), "utf8"),
  ).revision;
  const bytes = await fetchPinnedModelCatalog(pin);
  hydrateModelCatalogBytes(resolve(root, "vendor/pi"), bytes);
  console.log(`Hydrated Pi model data from pinned catalog ${pin}.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
