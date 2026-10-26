import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const node = join(root, "apps/desktop/src-tauri/resources/engine/node.exe");
const expected = JSON.parse(
  readFileSync(
    new URL("./fixtures/contracts/handshake.json", import.meta.url),
    "utf8",
  ),
);

function frame(value) {
  const data = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  return Buffer.concat([header, data]);
}

function responses(bytes) {
  const result = [];
  for (let offset = 0; offset < bytes.length;) {
    assert.ok(offset + 4 <= bytes.length, "complete response header");
    const length = bytes.readUInt32BE(offset);
    assert.ok(length > 0 && length + 4 <= 262144, "bounded response");
    offset += 4;
    assert.ok(offset + length <= bytes.length, "complete response payload");
    result.push(
      JSON.parse(bytes.subarray(offset, offset + length).toString("utf8")),
    );
    offset += length;
  }
  return result;
}

for (const [name, path] of [
  ["loaded SDK source host", "packages/splyce-pi/src/engine-host.mjs"],
  ["packaged engine host", "apps/desktop/src-tauri/resources/engine/host.mjs"],
]) {
  test(`${name}: actual native denial precedes startup state and model effects`, () => {
    const fixture = mkdtempSync(join(tmpdir(), "splyce-native-host-"));
    try {
      const version = spawnSync(node, ["--version"], { encoding: "utf8" });
      assert.equal(version.stdout.trim(), "v24.22.1");
      const result = spawnSync(node, [join(root, path)], {
        cwd: fixture,
        env: {
          ...(process.env.SystemRoot
            ? { SystemRoot: process.env.SystemRoot }
            : {}),
          HOME: fixture,
          USERPROFILE: fixture,
          TEMP: fixture,
          TMP: fixture,
          PI_CODING_AGENT_DIR: fixture,
        },
        input: Buffer.concat([
          frame({
            id: "check-1",
            method: "handshake",
            params: { protocolVersion: 1 },
          }),
          frame({
            id: "check-2",
            method: "send",
            params: {
              op: "session.start",
              payload: { initialPrompt: "do not execute" },
            },
          }),
          frame({ id: "check-3", method: "shutdown", params: {} }),
        ]),
        timeout: 15000,
        maxBuffer: 1048576,
        windowsHide: true,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr?.toString());
      assert.equal(result.stderr.length, 0);
      const replies = responses(result.stdout);
      assert.equal(replies.length, 3);
      assert.deepEqual(replies[0], {
        id: "check-1",
        ok: true,
        value: expected,
      });
      assert.equal(replies[1].id, "check-2");
      assert.equal(replies[1].ok, false);
      assert.equal(replies[1].error.code, "POLICY_DENIED");
      assert.equal(replies[1].error.retryable, false);
      assert.deepEqual(replies[2], {
        id: "check-3",
        ok: true,
        value: { state: "stopped" },
      });
      assert.deepEqual(
        readdirSync(fixture),
        [],
        "unavailable SDK must not create session/resources",
      );
    } finally {
      rmSync(fixture, { recursive: true });
    }
  });
}
