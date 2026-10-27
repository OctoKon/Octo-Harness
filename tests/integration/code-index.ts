// TD-43 / CTX_code_index — workspace code index on real fixture trees.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  CACHE_VERSION,
  CodeIndex,
  codeIndexTools,
} from "../../packages/splyce-index/dist/index.js";

const tmpRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "td43-index-")));
let counter = 0;
const fresh = (files: Record<string, string | Buffer>, git = false) => {
  counter += 1;
  const base = join(tmpRoot, `t${String(counter)}`);
  const root = join(base, "ws");
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  mkdirSync(root, { recursive: true });
  if (git) execFileSync("git", ["init", "-q"], { cwd: root });
  return { root, cache: join(base, "cache"), base };
};
const paths = (index: CodeIndex, query: string) =>
  index.search({ query }).map((h) => h.path);

test.after(() => rmSync(tmpRoot, { recursive: true, force: true }));

test("gitignore is respected; binaries and oversized files are skipped", async () => {
  for (const git of [true, false]) {
    const { root, cache } = fresh(
      {
        ".gitignore": "dist/\n*.log\n",
        "src/a.ts": "export const zebraToken = 1;\n",
        "dist/out.js": "zebraToken\n",
        "build.log": "zebraToken\n",
        "img.bin": Buffer.from([0x7a, 0, 0x01, 0x02, ...Buffer.from(" zebraToken")]),
        "big.txt": `zebraToken ${"x".repeat(5000)}`,
      },
      git,
    );
    const index = await CodeIndex.open({ root, cacheDir: cache, maxFileBytes: 4096 });
    assert.deepEqual(paths(index, "zebraToken"), ["src/a.ts"], `git=${String(git)}`);
  }
});

test("an escaping junction/symlink is recorded as a link and never followed", async () => {
  for (const git of [true, false]) {
    const { root, cache, base } = fresh({ "inside.ts": "const ok = 1;\n" }, git);
    const outside = join(base, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "secret.ts"), "const outsideCanary = 1;\n");
    symlinkSync(outside, join(root, "escape"), "junction");
    const index = await CodeIndex.open({ root, cacheDir: cache });
    assert.deepEqual(paths(index, "outsideCanary"), [], `git=${String(git)}`);
    assert.deepEqual(
      index.links.map((l) => l.path),
      ["escape"],
    );
    assert.equal(index.outline("escape/secret.ts").status, "not_indexed");
  }
});

test("root must be canonical and absolute", async () => {
  const { root, cache } = fresh({ "a.ts": "x" });
  for (const bad of ["ws", `${root}\\..\\ws`, join(root, "missing")])
    await assert.rejects(CodeIndex.open({ root: bad, cacheDir: cache }), {
      code: "ROOT_NOT_CANONICAL",
    });
});

test("incremental refresh re-reads only changes and drops deleted files", async () => {
  const { root, cache } = fresh({
    "keep.ts": "const keepAlpha = 1;\n",
    "edit.ts": "const beforeBravo = 1;\n",
    "gone.ts": "const deletedCharlie = 1;\n",
  });
  const index = await CodeIndex.open({ root, cacheDir: cache });
  assert.deepEqual(paths(index, "deletedCharlie"), ["gone.ts"]);
  writeFileSync(join(root, "edit.ts"), "const afterDelta = 22;\n");
  utimesSync(join(root, "edit.ts"), new Date(), new Date(Date.now() + 5000));
  rmSync(join(root, "gone.ts"));
  writeFileSync(join(root, "added.ts"), "const addedEcho = 1;\n");
  const report = await index.refresh();
  assert.deepEqual(report.reindexed.sort(), ["added.ts", "edit.ts"]);
  assert.deepEqual(report.removed, ["gone.ts"]);
  assert.equal(report.reused, 1);
  assert.deepEqual(paths(index, "deletedCharlie"), []);
  assert.deepEqual(paths(index, "beforeBravo"), []);
  assert.deepEqual(paths(index, "afterDelta"), ["edit.ts"]);
  assert.deepEqual(paths(index, "addedEcho"), ["added.ts"]);
  // Persisted: a reopened index reuses everything from cache.
  const reopened = await CodeIndex.open({ root, cacheDir: cache });
  assert.equal(reopened.cacheLoad, "loaded");
  assert.deepEqual(paths(reopened, "afterDelta"), ["edit.ts"]);
  assert.deepEqual((await reopened.refresh()).reindexed, []);
});

test("atomic cutover: concurrent queries see the old or new generation, never half", async () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 60; i++) files[`f${String(i)}.ts`] = "const oldKilo = 1;\n";
  const { root, cache } = fresh(files);
  const index = await CodeIndex.open({ root, cacheDir: cache });
  for (let i = 0; i < 60; i++) {
    writeFileSync(join(root, `f${String(i)}.ts`), "const newLima = 2;;\n");
  }
  const seen = new Set<string>();
  let done = false;
  const refreshing = index.refresh().then(() => (done = true));
  while (!done) {
    const oldN = index.search({ query: "oldKilo", limit: 100 }).length;
    const newN = index.search({ query: "newLima", limit: 100 }).length;
    seen.add(`${String(oldN)}/${String(newN)}`);
    await new Promise((r) => setImmediate(r));
  }
  await refreshing;
  seen.add(
    `${String(index.search({ query: "oldKilo", limit: 100 }).length)}/${String(index.search({ query: "newLima", limit: 100 }).length)}`,
  );
  assert.ok(seen.size >= 2, `queries interleaved with refresh: ${[...seen].join(",")}`);
  for (const s of seen) assert.ok(s === "60/0" || s === "0/60", `half index seen: ${s}`);
});

test("corrupt or version-mismatched cache is discarded and rebuilt", async () => {
  const { root, cache } = fresh({ "a.ts": "const realYankee = 1;\n" });
  const first = await CodeIndex.open({ root, cacheDir: cache });
  const file = first.cacheFile;
  writeFileSync(file, "{not json");
  const rebuilt = await CodeIndex.open({ root, cacheDir: cache });
  assert.equal(rebuilt.cacheLoad, "discarded");
  assert.deepEqual(paths(rebuilt, "realYankee"), ["a.ts"]);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).version, CACHE_VERSION);
  // A stale-version cache whose entry matches mtime+size must not be reused.
  const valid = JSON.parse(readFileSync(file, "utf8"));
  valid.version = CACHE_VERSION + 1;
  valid.files[0].text = "const ghostZulu = 1;";
  writeFileSync(file, JSON.stringify(valid));
  const again = await CodeIndex.open({ root, cacheDir: cache });
  assert.equal(again.cacheLoad, "discarded");
  assert.deepEqual(paths(again, "ghostZulu"), []);
  assert.deepEqual(paths(again, "realYankee"), ["a.ts"]);
});

test("ranking, identifier splitting, phrase and path filters", async () => {
  const filler = "lorem ipsum dolor sit amet\n".repeat(40);
  const { root, cache } = fresh({
    "src/config/parser.ts":
      "export function parseConfig(text: string) {\n  return parseConfigLine(text);\n}\nexport const config_parser = parseConfig;\n",
    "src/util/strings.ts": `${filler}// parse a config value\n`,
    "docs/notes.md": `${filler}the config file\n`,
    "src/http.rs": "pub struct HTTPServer;\nimpl HTTPServer {}\npub async fn serve() {}\n",
  });
  const index = await CodeIndex.open({ root, cacheDir: cache });
  const hits = index.search({ query: "parse config" });
  assert.equal(hits[0]?.path, "src/config/parser.ts");
  assert.equal(hits[0]?.line, 1);
  assert.ok(hits.length === 3 && hits[0]!.score > hits[1]!.score);
  assert.deepEqual(paths(index, "server"), ["src/http.rs"]);
  const phrase = index.search({ query: '"parse a config"' });
  assert.deepEqual(
    phrase.map((h) => [h.path, h.line, h.preview]),
    [["src/util/strings.ts", 41, "// parse a config value"]],
  );
  assert.deepEqual(
    index.search({ query: "config", pathGlob: "src/**/*.ts" }).map((h) => h.path).sort(),
    ["src/config/parser.ts", "src/util/strings.ts"],
  );
  assert.throws(() => index.search({ query: "x", limit: 0 }), {
    code: "INVALID_ARGUMENT",
  });
});

test("outline and tool surface", async () => {
  const { root, cache } = fresh({
    "a.ts": "export async function go() {}\nexport class Box {}\n  const inner = 1;\ntype T = 1;\n",
    "b.py": "class Model:\n    def inner(self): pass\ndef main():\n    pass\n",
    "c.go": "func (s *S) Run() {}\nfunc main() {}\ntype S struct{}\n",
    "d.rs": "pub fn top() {}\nimpl Foo for Bar {\n}\n",
    "e.md": "# hi\n",
  });
  const index = await CodeIndex.open({ root, cacheDir: cache });
  const names = (p: string) => {
    const r = index.outline(p);
    return r.status === "ok" ? r.symbols.map((s) => `${s.kind}:${s.name}@${String(s.line)}`) : r.status;
  };
  assert.deepEqual(names("a.ts"), ["function:go@1", "class:Box@2", "type:T@4"]);
  assert.deepEqual(names("b.py"), ["class:Model@1", "def:main@3"]);
  assert.deepEqual(names("c.go"), ["method:Run@1", "func:main@2", "type:S@3"]);
  assert.deepEqual(names("d.rs"), ["fn:top@1", "impl:Foo for Bar@2"]);
  assert.deepEqual(index.outline("e.md"), { status: "unsupported", language: "md" });

  const [search, outline] = codeIndexTools(index);
  assert.equal(search?.name, "code_search");
  writeFileSync(join(root, "later.ts"), "const agentWrote = 1;\n");
  const out = (await search!.execute({ query: "agentWrote" })) as {
    results: { path: string }[];
  };
  assert.deepEqual(out.results.map((r) => r.path), ["later.ts"]);
  assert.deepEqual(await outline!.execute({ path: "later.ts" }), {
    status: "ok",
    language: "typescript",
    symbols: [{ name: "agentWrote", kind: "const", line: 1 }],
  });
  await assert.rejects(search!.execute({ query: 5 }), { code: "INVALID_ARGUMENT" });
});
