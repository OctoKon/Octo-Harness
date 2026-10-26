import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));

test("embedded WebDriver is absent from the release build and capability", async () => {
  const manifest = "apps/desktop/src-tauri/Cargo.toml";
  const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
  const graph = (features = []) =>
    execFileSync(
      cargo,
      [
        "tree",
        "--locked",
        "--manifest-path",
        manifest,
        "--edges",
        "features",
        ...features,
      ],
      { cwd: root, encoding: "utf8", timeout: 120000 },
    );

  assert.doesNotMatch(graph(), /tauri-plugin-wdio-webdriver/);
  assert.match(graph(["--features", "e2e"]), /tauri-plugin-wdio-webdriver/);

  const release = await readJson("apps/desktop/src-tauri/tauri.conf.json");
  const e2e = await readJson("apps/desktop/src-tauri/tauri.e2e.conf.json");
  const e2eCapability = await readJson(
    "apps/desktop/src-tauri/capabilities/e2e.json",
  );
  assert.deepEqual(release.app.security.capabilities, ["main"]);
  assert.deepEqual(e2e.app.security.capabilities, ["main", "e2e"]);
  assert.equal(e2e.bundle.active, false);
  assert.deepEqual(e2eCapability.permissions, ["wdio-webdriver:default"]);
});

test("embedded WebDriver tool pins match their lockfiles", async () => {
  const inventory = await readJson(
    "apps/desktop/embedded-e2e-tool-inventory.json",
  );
  const packageJson = await readJson("package.json");
  const packageLock = await readJson("package-lock.json");
  const runtimePins = await readJson("runtime-pins.json");
  for (const tool of inventory.packages.filter(
    (item) => item.name !== "tauri-plugin-wdio-webdriver",
  )) {
    const locked = packageLock.packages[`node_modules/${tool.name}`];
    assert.equal(locked?.version, tool.version, `${tool.name} version`);
    assert.equal(locked?.license, tool.license, `${tool.name} license`);
    if (!tool.via)
      assert.equal(packageJson.devDependencies[tool.name], tool.version);
  }
  const cargoLock = await readFile(
    resolve(root, "apps/desktop/src-tauri/Cargo.lock"),
    "utf8",
  );
  const crate = cargoLock
    .split("[[package]]")
    .find((entry) => entry.includes('name = "tauri-plugin-wdio-webdriver"'));
  assert.match(crate, /version = "1\.4\.0"/);
  assert.match(
    crate,
    /checksum = "52c5e97428174a52b7f4357bbc4535fcce52c6a06c8ee7a379502f7cda1b6045"/,
  );
  const lockedPackages = new Set(
    [...cargoLock.matchAll(/name = "([^"]+)"\nversion = "([^"]+)"/g)].map(
      ([, name, version]) => `${name}@${version}`,
    ),
  );
  assert(inventory.cargoPackages.length > 0);
  for (const tool of inventory.cargoPackages) {
    assert(tool.license, `${tool.name} license`);
    assert(tool.repository, `${tool.name} source repository`);
    assert(lockedPackages.has(`${tool.name}@${tool.version}`));
  }
  assert.equal(inventory.runtime.node, runtimePins.node.version);
  assert.equal(inventory.runtime.npm, runtimePins.node.npm);
  assert.equal(inventory.runtime.rust, runtimePins.rust.toolchain);
});
