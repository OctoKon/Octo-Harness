import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// TD-09/TD-15 integration runner: J0_store_contract (store) and the TD-15
// receipts cases. Usage: node scripts/run-store.mjs [--case J0_store_contract
// | --case C1_reconnect_cursor]. Root npm wiring is TD-11's.

const args = process.argv.slice(2);
let namePattern = "S1|S2|S3|S4|S5|S6|S7|S8|rollback|ownership|receipt";
if (args.length > 0) {
  if (args.length !== 2 || args[0] !== "--case") {
    console.error(
      "Usage: node scripts/run-store.mjs [--case J0_store_contract | --case C1_reconnect_cursor]",
    );
    process.exit(2);
  }
  if (args[1] === "J0_store_contract")
    namePattern = "S1|S2|S3|S4|S5|S6|S7|S8|rollback|ownership";
  else if (args[1] === "C1_reconnect_cursor") namePattern = "receipt";
  else {
    console.error(`unknown case ${args[1]}`);
    process.exit(2);
  }
}

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
for (const command of [
  [
    require.resolve("typescript/bin/tsc"),
    "-p",
    "packages/splyce-pi/tsconfig.json",
  ],
  [
    "--test",
    `--test-name-pattern=${namePattern}`,
    "--test-timeout=120000",
    "tests/integration/store.ts",
    "tests/integration/receipts.ts",
  ],
]) {
  const result = spawnSync(process.execPath, command, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
