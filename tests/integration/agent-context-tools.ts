// C2_agent_context_tools: read-only code-index and memory tools for the agent,
// on a real index over a temp repo and a real Memory over a temp Store.
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  CodeIndex,
  codeIndexTools,
} from "../../packages/splyce-index/dist/index.js";
import {
  MAX_OUTPUT_BYTES,
  captureMemoryAfterTurn,
  createAgentContextTools,
} from "../../packages/splyce-pi/dist/agent-context-tools.js";
import { redactSecrets } from "../../packages/splyce-retrieval/dist/retrieval.js";
import { commit, setup, turn } from "./memory-fixture.ts";

// Built at runtime: a fake credential, not a real one.
const SECRET = ["sk", "abcdefgh1234567890zzzz"].join("-");
const tmpRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "c2-ctx-")));
test.after(() => rmSync(tmpRoot, { recursive: true, force: true }));

let n = 0;
async function repo(files: Record<string, string>) {
  n += 1;
  const root = join(tmpRoot, `r${String(n)}`, "ws");
  mkdirSync(root, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  const index = await CodeIndex.open({
    root,
    cacheDir: join(tmpRoot, `r${String(n)}`, "cache"),
  });
  return { root, index };
}
const FILES = {
  "src/a.ts": "export function alphaWidget(): number {\n  return 1;\n}\n",
  "src/b.ts":
    'import { alphaWidget } from "./a";\nexport const betaUse = alphaWidget();\n',
  "src/conf.ts": `export const confLoader = 1;\nconst apiKey = "${SECRET}";\nalphaWidget("${SECRET}");\n`,
};
const build = async (
  files: Record<string, string> = FILES,
  redact = redactSecrets,
) => {
  const { root, index } = await repo(files);
  const tools = createAgentContextTools({
    workspaceRoot: root,
    index,
    codeTools: codeIndexTools(index),
    redact,
  });
  const by = (name: string) => {
    const tool = tools.find((t) => t.name === name);
    assert.ok(tool, name);
    return tool;
  };
  return { root, index, tools, by };
};
const json = async (
  tool: { execute: (a: Record<string, unknown>) => Promise<string> },
  args: Record<string, unknown>,
) => JSON.parse(await tool.execute(args)) as Record<string, unknown>;
const code = (expected: string) => (error: unknown) =>
  (error as { code?: unknown }).code === expected;

test("C2: code tools return index results and are all read-only", async () => {
  const { by, tools } = await build();
  assert.deepEqual(
    tools.map((t) => t.name),
    [
      "code_search",
      "code_outline",
      "code_related",
      "code_dependencies",
      "code_dependents",
      "code_symbol",
    ],
  );
  assert.ok(tools.every((t) => t.readOnly));
  const search = await json(by("code_search"), { query: "alphaWidget" });
  assert.ok(
    (search.results as { path: string }[]).some((h) => h.path === "src/a.ts"),
  );
  assert.match(
    JSON.stringify(await json(by("code_outline"), { path: "src/a.ts" })),
    /alphaWidget/,
  );
  assert.match(
    JSON.stringify(await json(by("code_dependencies"), { path: "src/b.ts" })),
    /src\/a\.ts/,
  );
  assert.match(
    JSON.stringify(await json(by("code_dependents"), { path: "src/a.ts" })),
    /src\/b\.ts/,
  );
  assert.match(
    JSON.stringify(await json(by("code_symbol"), { name: "alphaWidget" })),
    /src\/b\.ts/,
  );
  assert.match(
    JSON.stringify(await json(by("code_related"), { target: "src/a.ts" })),
    /src\/b\.ts/,
  );
  const r = await by("code_search").result({ query: "alphaWidget" });
  assert.equal(r.summary.truncated, false);
  assert.ok(r.summary.bytes > 0 && r.summary.preview.length > 0);
});

test("C2: paths outside the admitted root are rejected; a foreign index is refused", async () => {
  const { by, index } = await build();
  for (const [name, args] of [
    ["code_outline", { path: "../secret.ts" }],
    ["code_outline", { path: "src/../../x.ts" }],
    ["code_outline", { path: "/etc/passwd" }],
    ["code_outline", { path: "C:\\Windows\\win.ini" }],
    ["code_dependencies", { path: "..\\x.ts" }],
    ["code_related", { target: "../x.ts" }],
    ["code_search", { query: "a", pathGlob: "../**" }],
  ] as const)
    await assert.rejects(by(name).execute(args), code("WORKSPACE_ESCAPE"));
  await assert.rejects(
    by("code_outline").execute({ path: "" }),
    code("BAD_ARGS"),
  );
  const other = await repo({ "x.ts": "export const x = 1;\n" });
  assert.throws(
    () =>
      createAgentContextTools({
        workspaceRoot: other.root,
        index,
        codeTools: codeIndexTools(index),
        redact: redactSecrets,
      }),
    code("ROOT_MISMATCH"),
  );
});

test("C2: a secret inside an indexed file never appears in any tool output", async () => {
  const { by } = await build();
  const outputs = await Promise.all([
    by("code_search").execute({ query: "apiKey confLoader" }),
    by("code_search").execute({ query: SECRET }),
    by("code_symbol").execute({ name: "alphaWidget" }),
    by("code_symbol").execute({ name: "confLoader" }),
    by("code_outline").execute({ path: "src/conf.ts" }),
  ]);
  for (const text of outputs) assert.ok(!text.includes(SECRET), text);
  assert.ok(outputs.some((t) => t.includes("conf")));
});

test("C2: scrub guard is live (an identity redactor leaks the same fixture)", async () => {
  const { by } = await build(FILES, (t) => t);
  const outputs = await Promise.all([
    by("code_search").execute({ query: "apiKey confLoader" }),
    by("code_symbol").execute({ name: "alphaWidget" }),
  ]);
  assert.ok(outputs.some((t) => t.includes(SECRET)));
});

test("C2: output is capped at the index 64 KB, also for oversized tool text", async () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 400; i += 1)
    files[`src/m${String(i)}.ts`] =
      `export const marker${String(i)} = "${"y".repeat(300)}";\n// bulkword\n`;
  const { by, root, index } = await build(files);
  const r = await by("code_search").result({ query: "bulkword", limit: 200 });
  assert.ok(Buffer.byteLength(r.text) <= MAX_OUTPUT_BYTES);
  assert.equal(MAX_OUTPUT_BYTES, 64 * 1024);
  const [tool] = createAgentContextTools({
    workspaceRoot: root,
    index,
    codeTools: [
      {
        name: "big",
        description: "d",
        parameters: {},
        execute: async () => "z".repeat(200 * 1024),
      },
    ],
    redact: redactSecrets,
  });
  assert.ok(tool);
  const big = await tool.result({});
  assert.equal(Buffer.byteLength(big.text), MAX_OUTPUT_BYTES);
  assert.equal(big.summary.truncated, true);
  assert.ok(big.summary.bytes > MAX_OUTPUT_BYTES);
});

test("C2: memory_search returns cited results after capture and is scope-bound", async (t) => {
  const fx = setup(t);
  commit(
    fx.store,
    turn("a", "src/db/pool.ts", "Database pool size raised to twenty."),
  );
  commit(
    fx.store,
    turn("o", "src/other.ts", "Unrelated pool tuning elsewhere.", "w-other"),
    "w-other",
  );
  const { root, index } = await repo(FILES);
  const tools = createAgentContextTools({
    workspaceRoot: root,
    index,
    codeTools: codeIndexTools(index),
    memory: fx.memory,
    scopeId: "w-demo",
    redact: redactSecrets,
  });
  const memory = tools.find((x) => x.name === "memory_search");
  assert.ok(memory?.readOnly);
  const before = await json(memory, { query: "database pool" });
  assert.deepEqual(before.results, []);
  assert.equal(captureMemoryAfterTurn(fx.memory, "w-demo", "s1"), 1);
  const after = (await json(memory, { query: "database pool", limit: 5 })) as {
    results: { text: string; sourceIds: string[] }[];
  };
  assert.equal(after.results.length, 1);
  assert.match(after.results[0]?.text ?? "", /Database pool size raised/);
  assert.deepEqual(after.results[0]?.sourceIds, [
    "event:a-intent",
    "event:a-outcome",
  ]);
  await assert.rejects(
    memory.execute({ query: "x", limit: 99 }),
    code("BAD_ARGS"),
  );
  await assert.rejects(memory.execute({ query: "" }), code("BAD_ARGS"));
  assert.throws(
    () =>
      createAgentContextTools({
        workspaceRoot: root,
        index,
        codeTools: [],
        memory: fx.memory,
        redact: redactSecrets,
      }),
    code("BAD_ARGS"),
  );
});

test("C2: memory output is scrubbed and each observation text is capped", async () => {
  const { root, index } = await repo(FILES);
  const tools = createAgentContextTools({
    workspaceRoot: root,
    index,
    codeTools: [],
    memory: {
      capture: () => [],
      query: async () => [
        {
          observationId: "o1",
          text: `leak ${SECRET} ${"w".repeat(5000)}`,
          sourceIds: ["event:x"],
          score: 1,
          createdAt: "2026-10-27T00:00:00.000Z",
        },
      ],
    },
    scopeId: "w-demo",
    redact: redactSecrets,
  });
  const text = await tools[0]?.execute({ query: "leak" });
  assert.ok(text && !text.includes(SECRET));
  assert.ok(text.length < 2500);
});
