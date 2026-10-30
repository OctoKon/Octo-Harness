// The packaged UIA gate asserts exact accessible copy on the real demo build. It cannot run
// without an installer, so nothing caught `bootstrap.ps1` still expecting the pre-prototype
// "Backend native services" banner after ec2f912 replaced the shell: every demo build's UIA
// run failed at the first assertion and no unit test noticed. This pins the two files to each
// other - every copy string the gate asserts must exist in the renderer it drives, and copy
// that was retired may not come back into either file.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs with the workspace package (apps/desktop) as cwd for both the workspace
// script and a direct `npx vitest` invocation.
const desktop = process.cwd();
const read = (path: string) => readFileSync(resolve(desktop, path), "utf8");

const gate = read("tests/gui/uia/bootstrap.ps1");
const renderer = read("src/App.svelte");
const tauriConf = JSON.parse(read("src-tauri/tauri.conf.json")) as {
  productName?: unknown;
};

/** `$_.name -ceq 'exact'` / `-like 'prefix*'` are the only copy assertions the gate makes. */
const asserted = [
  ...gate.matchAll(/\$_\.name\s+-(ceq|like|eq)\s+'([^']+)'/g),
].map(([, operator, text]) => ({
  operator,
  // A `-like` pattern is always a prefix of the full sentence; compare on the prefix.
  expected: operator === "like" ? text.replace(/\*$/, "") : text,
}));

describe("packaged UIA gate copy matches the renderer", () => {
  it("reads the gate from the desktop package root", () => {
    expect(existsSync(resolve(desktop, "tests/gui/uia/bootstrap.ps1"))).toBe(
      true,
    );
  });

  it("finds the gate's copy assertions at all", () => {
    // Guards this test itself: a regex drift must fail loudly, not pass vacuously.
    expect(asserted.length).toBeGreaterThanOrEqual(4);
    expect(asserted.map((a) => a.expected)).toContain("Engine Unavailable");
    expect(asserted.map((a) => a.expected)).toContain("Engine stopped");
  });

  it("asserts only copy the renderer actually emits", () => {
    // 'Splyce' is the window title, which comes from the Tauri config, not the renderer.
    const copy = asserted.filter(({ expected }) => expected !== "Splyce");
    expect(copy.length).toBeGreaterThanOrEqual(4);
    for (const { expected } of copy) expect(renderer).toContain(expected);
  });

  it("names the window with the packaged product name", () => {
    expect(tauriConf.productName).toBe("Splyce");
    expect(gate).toContain("'Splyce'");
  });

  it("keeps the retired pre-prototype banner out of both files", () => {
    expect(gate).not.toContain("Backend native services");
    expect(renderer).not.toContain("Backend native services");
  });
});
