import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { createSplyceOwner } from "../vendor/pi/packages/agent/src/splyce-readiness.ts";
import {
  SessionManager,
  assertUnownedSessionExport,
} from "../vendor/pi/packages/coding-agent/src/core/session-manager.ts";

const marker = "fixture-persistence-private-value";
const unavailable = {
  code: "PERSIST_REDACTION_UNAVAILABLE",
  message: "PERSIST_REDACTION_UNAVAILABLE",
};
const tooLarge = {
  code: "PERSIST_ENTRY_TOO_LARGE",
  message: "PERSIST_ENTRY_TOO_LARGE",
};
const user = (text) => ({
  role: "user",
  content: [{ type: "text", text }],
  timestamp: 0,
});
function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), "splyce-session-persistence-"));
  t.after(() => {
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith("splyce-session-persistence-"));
    rmSync(target, { recursive: true, force: true });
  });
  return directory;
}
function deferred() {
  let resolve;
  const promise = new Promise((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

for (const change of ["id", "shape", "role"]) {
  test(`valid JSON with changed ${change} cannot commit a native session`, async (t) => {
    const directory = temporary(t);
    const owner = createSplyceOwner(() => {});
    let corrupt = false;
    const manager = await SessionManager.createOwned(
      directory,
      (subject) =>
        owner.bindPersistence(subject, async (text) => {
          const row = JSON.parse(text);
          if (!corrupt || row?.type !== "message") return text;
          if (change === "id") row.id = "different-structural-id";
          else if (change === "shape") row.unexpected = "field";
          else row.message.role = "assistant";
          return JSON.stringify(row);
        }),
      join(directory, "sessions"),
    );
    const before = structuredClone(manager.getEntries());
    corrupt = true;
    await assert.rejects(
      manager.withPersistence((draft) => draft.appendMessage(user(marker))),
      unavailable,
    );
    assert.deepEqual(manager.getEntries(), before);
    assert.equal(existsSync(manager.getSessionFile()), false);
  });
}

test("late draft aliases cannot alter sanitized nested results or committed state", async () => {
  const manager = SessionManager.inMemory("C:/synthetic-project");
  const entered = deferred(),
    release = deferred();
  let block = true;
  createSplyceOwner(() => {}).bindPersistence(manager, async (text) => {
    if (block) {
      block = false;
      entered.resolve();
      await release.promise;
    }
    return text.replaceAll(marker, "[redacted]");
  });
  let escaped, retained;
  const pending = manager.withPersistence((draft) => {
    escaped = draft;
    assert.throws(() => assertUnownedSessionExport({}), unavailable);
    const id = draft.appendCustomEntry("fixture", {
      nested: { value: marker },
    });
    retained = draft.getEntry(id);
    return { entry: retained, text: marker };
  });
  await entered.promise;
  assert.throws(() => escaped.appendMessage(user("late")));
  retained.data.nested.value = "late mutation";
  release.resolve();
  const result = await pending;
  assert.equal(result.text, "[redacted]");
  assert.equal(result.entry.data.nested.value, "[redacted]");
  assert.equal(
    manager.getEntry(result.entry.id).data.nested.value,
    "[redacted]",
  );
  result.entry.data.nested.value = "returned mutation";
  assert.equal(
    manager.getEntry(result.entry.id).data.nested.value,
    "[redacted]",
  );
  const readAlias = manager.getEntry(result.entry.id);
  readAlias.data.nested.value = "getter mutation";
  assert.equal(
    manager.getEntry(result.entry.id).data.nested.value,
    "[redacted]",
  );
  assert.throws(() => escaped.getEntry(result.entry.id));
  assert.throws(() => assertUnownedSessionExport(escaped), unavailable);
});

test("exclusive first flush preserves a colliding file and recovers without publishing failed state", async (t) => {
  const directory = temporary(t);
  const owner = createSplyceOwner(() => {});
  const manager = await SessionManager.createOwned(
    directory,
    (subject) =>
      owner.bindPersistence(subject, async (text) =>
        text.replaceAll(marker, "[redacted]"),
      ),
    join(directory, "sessions"),
  );
  const path = manager.getSessionFile();
  writeFileSync(path, "collision sentinel");
  const before = structuredClone(manager.getEntries());
  await assert.rejects(
    manager.withPersistence((draft) => draft.appendMessage(user(marker))),
    unavailable,
  );
  assert.equal(readFileSync(path, "utf8"), "collision sentinel");
  assert.deepEqual(manager.getEntries(), before);
  unlinkSync(path);
  const id = await manager.withPersistence((draft) =>
    draft.appendMessage(user(marker)),
  );
  assert.equal(manager.getEntry(id).message.content[0].text, "[redacted]");
  assert.equal(readFileSync(path, "utf8").includes(marker), false);
  const reopened = await SessionManager.openOwned(path, (subject) =>
    owner.bindPersistence(subject, async (text) =>
      text.replaceAll(marker, "[redacted]"),
    ),
  );
  assert.equal(reopened.getEntry(id).message.content[0].text, "[redacted]");
});

test("a malformed sanitized result and multiple staged write targets fail before publication", async (t) => {
  const manager = SessionManager.inMemory("C:/synthetic-project");
  createSplyceOwner(() => {}).bindPersistence(manager, async (text) =>
    JSON.parse(text)?.type ? text : "null",
  );
  await assert.rejects(
    manager.withPersistence((draft) => draft.appendMessage(user("benign"))),
    unavailable,
  );
  assert.equal(manager.getEntries().length, 0);
  const directory = temporary(t);
  const owner = createSplyceOwner(() => {});
  const persistent = await SessionManager.createOwned(
    directory,
    (subject) => owner.bindPersistence(subject, async (text) => text),
    join(directory, "sessions"),
  );
  const originalPath = persistent.getSessionFile();
  await assert.rejects(
    persistent.withPersistence((draft) => {
      draft.appendMessage(user("first target"));
      return draft.newSession();
    }),
    unavailable,
  );
  assert.equal(persistent.getEntries().length, 0);
  assert.equal(existsSync(originalPath), false);
});

test("an append error latches the manager until an explicit owned reopen", async (t) => {
  const directory = temporary(t);
  const owner = createSplyceOwner(() => {});
  const bind = (subject) =>
    owner.bindPersistence(subject, async (text) => text);
  const manager = await SessionManager.createOwned(
    directory,
    bind,
    join(directory, "sessions"),
  );
  await manager.withPersistence((draft) =>
    draft.appendMessage(user("acknowledged")),
  );
  const path = manager.getSessionFile();
  const backup = path + ".test-backup";
  renameSync(path, backup);
  mkdirSync(path);
  await assert.rejects(
    manager.withPersistence((draft) =>
      draft.appendMessage(user("unacknowledged")),
    ),
    unavailable,
  );
  rmdirSync(path);
  renameSync(backup, path);
  await assert.rejects(
    manager.withPersistence((draft) =>
      draft.appendMessage(user("blind retry")),
    ),
    unavailable,
  );
  assert.equal(readFileSync(path, "utf8").includes("blind retry"), false);
  const reopened = await SessionManager.openOwned(path, bind);
  await reopened.withPersistence((draft) =>
    draft.appendMessage(user("explicit recovery")),
  );
  assert.equal(readFileSync(path, "utf8").includes("explicit recovery"), true);
});

test("a pointer-only stage commits newly sanitized historical bytes with its state", async (t) => {
  const directory = temporary(t);
  const owner = createSplyceOwner(() => {});
  let matching = false;
  const manager = await SessionManager.createOwned(
    directory,
    (subject) =>
      owner.bindPersistence(subject, async (text) =>
        matching ? text.replaceAll(marker, "[redacted]") : text,
      ),
    join(directory, "sessions"),
  );
  const id = await manager.withPersistence((draft) =>
    draft.appendMessage(user(marker)),
  );
  matching = true;
  await manager.withPersistence((draft) => draft.resetLeaf());
  assert.equal(
    readFileSync(manager.getSessionFile(), "utf8").includes(marker),
    false,
  );
  assert.equal(manager.getEntry(id).message.content[0].text, "[redacted]");
  assert.equal(manager.getLeafId(), null);
});

test("a one-MiB safe history appends one new qualified entry without resending its prefix or result graph", async (t) => {
  const directory = temporary(t);
  const owner = createSplyceOwner(() => {});
  const observed = [];
  const manager = await SessionManager.createOwned(
    directory,
    (subject) =>
      owner.bindPersistence(subject, async (text) => {
        assert.ok(
          Buffer.byteLength(JSON.stringify(text), "utf8") <= 256 * 1024,
        );
        observed.push(text);
        return text.replaceAll(marker, "[redacted]");
      }),
    join(directory, "sessions"),
  );
  const result = await manager.withPersistence((draft) => {
    for (let index = 0; index < 130; index++)
      draft.appendMessage(user(`history-${index} ${"x".repeat(8192)}`));
    return draft.getEntries();
  });
  assert.equal(result.length, 130);
  const before = readFileSync(manager.getSessionFile(), "utf8");
  assert.ok(Buffer.byteLength(before, "utf8") > 1024 * 1024);
  observed.length = 0;
  const id = await manager.withPersistence((draft) =>
    draft.appendMessage(user(marker)),
  );
  assert.equal(
    observed.filter((text) => JSON.parse(text)?.type === "message").length,
    1,
  );
  assert.equal(
    observed.some((text) => text.includes("history-")),
    false,
  );
  const after = readFileSync(manager.getSessionFile(), "utf8");
  assert.equal(after.startsWith(before), true);
  assert.equal(after.includes(marker), false);
  assert.equal(manager.getEntry(id).message.content[0].text, "[redacted]");
});

test("one entry above the encoded frame lower bound has no file or state effect and is never split", async (t) => {
  const directory = temporary(t);
  const owner = createSplyceOwner(() => {});
  let calls = 0;
  const manager = await SessionManager.createOwned(
    directory,
    (subject) =>
      owner.bindPersistence(subject, async (text) => {
        calls++;
        return text;
      }),
    join(directory, "sessions"),
  );
  const oversized = user("\\".repeat(70 * 1024));
  await assert.rejects(
    manager.withPersistence((draft) => draft.appendMessage(oversized)),
    tooLarge,
  );
  assert.equal(existsSync(manager.getSessionFile()), false);
  assert.equal(manager.getEntries().length, 0);
  await manager.withPersistence((draft) =>
    draft.appendMessage(user("small successful entry")),
  );
  const before = readFileSync(manager.getSessionFile(), "utf8");
  const entries = manager.getEntries();
  calls = 0;
  await assert.rejects(
    manager.withPersistence((draft) => draft.appendMessage(oversized)),
    tooLarge,
  );
  assert.equal(
    calls,
    0,
    "oversized entry must fail before the native lane sees any fragment",
  );
  assert.equal(readFileSync(manager.getSessionFile(), "utf8"), before);
  assert.deepEqual(manager.getEntries(), entries);
});
