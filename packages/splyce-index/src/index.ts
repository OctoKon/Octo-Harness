// TD-43 / CTX_code_index — lexical index of the agent's workspace.
// The caller (native host / engine, never the renderer) passes a canonical
// absolute workspace root and an app-data cache dir. Links are recorded and
// never followed (same rule as src/snapshots.ts); a refresh builds a new
// generation and swaps it in one assignment, so a query never sees a half
// index. Stdlib only.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export const CACHE_VERSION = 1;
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const BINARY_SNIFF_BYTES = 8192;
const K1 = 1.2;
const B = 0.75;

export class CodeIndexError extends Error {
  readonly code:
    | "ROOT_NOT_CANONICAL"
    | "CACHE_DIR_INVALID"
    | "INVALID_ARGUMENT";
  constructor(code: CodeIndexError["code"], message: string) {
    super(message);
    this.name = "CodeIndexError";
    this.code = code;
  }
}

export interface IndexedLink {
  path: string;
  target: string;
}
export interface SearchInput {
  query: string;
  pathGlob?: string;
  limit?: number;
}
export interface SearchHit {
  path: string;
  line: number;
  preview: string;
  score: number;
}
export interface OutlineSymbol {
  name: string;
  kind: string;
  line: number;
}
export type OutlineResult =
  | { status: "ok"; language: string; symbols: OutlineSymbol[] }
  | { status: "unsupported"; language: string }
  | { status: "not_indexed" };
export interface RefreshReport {
  reindexed: string[];
  removed: string[];
  reused: number;
  skipped: string[];
  links: readonly IndexedLink[];
}
export type CacheLoad = "loaded" | "absent" | "discarded";

interface FileDoc {
  readonly mtimeMs: number;
  readonly size: number;
  readonly text: string;
  readonly lines: readonly string[];
  readonly tf: ReadonlyMap<string, number>;
  readonly len: number;
}
interface Generation {
  readonly files: ReadonlyMap<string, FileDoc>;
  readonly postings: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly avgLen: number;
  readonly links: readonly IndexedLink[];
}

/** Words plus their camelCase / snake_case parts, lowercased. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[A-Za-z0-9_]+/g)) {
    const lower = m[0].toLowerCase();
    out.push(lower);
    for (const part of m[0].split(
      /_+|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/,
    )) {
      const p = part.toLowerCase();
      if (p && p !== lower) out.push(p);
    }
  }
  return out;
}

/** `*` within a segment, `**` across segments, `?` one char. */
export function globRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

function makeDoc(text: string, mtimeMs: number, size: number): FileDoc {
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return { mtimeMs, size, text, lines: text.split(/\r?\n/), tf, len: tokens.length };
}

// ponytail: postings are reassembled from per-file term maps on every
// generation (O(total distinct terms)); only changed files are re-read and
// re-tokenized. Patch postings incrementally if large workspaces need it.
function finalize(
  files: ReadonlyMap<string, FileDoc>,
  links: readonly IndexedLink[],
): Generation {
  const postings = new Map<string, Map<string, number>>();
  let total = 0;
  for (const [path, doc] of files) {
    total += doc.len;
    for (const [t, f] of doc.tf) {
      let post = postings.get(t);
      if (!post) postings.set(t, (post = new Map()));
      post.set(path, f);
    }
  }
  return Object.freeze({
    files,
    postings,
    avgLen: files.size ? total / files.size : 0,
    links: Object.freeze([...links]),
  });
}

function canonicalRoot(root: unknown): string {
  if (typeof root !== "string" || !isAbsolute(root) || resolve(root) !== root)
    throw new CodeIndexError("ROOT_NOT_CANONICAL", "root must be a canonical absolute path");
  let real: string;
  try {
    real = realpathSync.native(root);
  } catch {
    throw new CodeIndexError("ROOT_NOT_CANONICAL", "root does not exist");
  }
  const same =
    process.platform === "win32"
      ? real.toLowerCase() === root.toLowerCase()
      : real === root;
  if (!same || !lstatSync(root).isDirectory())
    throw new CodeIndexError("ROOT_NOT_CANONICAL", "root must be a canonical directory (no links)");
  return root;
}

const lstatOrNull = (p: string): Stats | null => {
  try {
    return lstatSync(p);
  } catch {
    return null; // vanished between listing and stat: not a candidate
  }
};

interface Candidate {
  rel: string;
  size: number;
  mtimeMs: number;
}

/** `git ls-files` when the root is in a work tree; null otherwise. */
function gitList(root: string): string[] | null {
  try {
    const out = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 1 << 28,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      },
    );
    return out.split("\0").filter(Boolean);
  } catch {
    return null; // not a git work tree (or git absent): root .gitignore fallback
  }
}

// ponytail: non-git fallback honours only the root .gitignore, without `!`
// negation; git work trees use git's own matcher.
function rootIgnore(root: string): (rel: string, dir: boolean) => boolean {
  const file = join(root, ".gitignore");
  const rules = (existsSync(file) ? readFileSync(file, "utf8") : "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"))
    .map((l) => {
      const dirOnly = l.endsWith("/");
      let p = dirOnly ? l.slice(0, -1) : l;
      const anchored = p.includes("/");
      if (p.startsWith("/")) p = p.slice(1);
      return { dirOnly, anchored, re: globRegExp(p) };
    });
  return (rel, dir) =>
    rules.some(
      (r) =>
        (!r.dirOnly || dir) &&
        r.re.test(r.anchored ? rel : rel.slice(rel.lastIndexOf("/") + 1)),
    );
}

function listCandidates(root: string): {
  files: Candidate[];
  links: IndexedLink[];
} {
  const files: Candidate[] = [];
  const links: IndexedLink[] = [];
  const classify = (rel: string, st: Stats) => {
    if (st.isSymbolicLink())
      links.push({ path: rel, target: readlinkSync(join(root, rel)) });
    else if (st.isFile())
      files.push({ rel, size: st.size, mtimeMs: st.mtimeMs });
  };
  const listed = gitList(root);
  if (listed) {
    // A listed path under a link (git may list through a junction) is never
    // read: every ancestor directory is lstat'ed once.
    const dirOk = new Map<string, boolean>([["", true]]);
    const okDir = (rel: string): boolean => {
      const known = dirOk.get(rel);
      if (known !== undefined) return known;
      const cut = rel.lastIndexOf("/");
      let ok = okDir(cut < 0 ? "" : rel.slice(0, cut));
      if (ok) {
        const st = lstatOrNull(join(root, rel));
        if (st?.isSymbolicLink()) {
          classify(rel, st);
          ok = false;
        } else ok = st?.isDirectory() ?? false;
      }
      dirOk.set(rel, ok);
      return ok;
    };
    for (const rel of listed) {
      const cut = rel.lastIndexOf("/");
      if (!okDir(cut < 0 ? "" : rel.slice(0, cut))) continue;
      const st = lstatOrNull(join(root, rel));
      if (st) classify(rel, st);
    }
  } else {
    const ignored = rootIgnore(root);
    const walk = (dir: string, prefix: string) => {
      for (const name of readdirSync(dir)) {
        if (name === ".git") continue;
        const rel = prefix ? `${prefix}/${name}` : name;
        const st = lstatOrNull(join(dir, name));
        if (!st || ignored(rel, st.isDirectory())) continue;
        if (st.isDirectory()) walk(join(dir, name), rel);
        else classify(rel, st);
      }
    };
    walk(root, "");
  }
  return { files, links };
}

interface CacheFile {
  version: number;
  root: string;
  files: { path: string; mtimeMs: number; size: number; text: string }[];
}

function loadCache(
  file: string,
  root: string,
): { status: CacheLoad; files: Map<string, FileDoc> } {
  const files = new Map<string, FileDoc>();
  if (!existsSync(file)) return { status: "absent", files };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { status: "discarded", files }; // corrupt: rebuild from source
  }
  const c = raw as Partial<CacheFile> | null;
  if (
    !c ||
    c.version !== CACHE_VERSION ||
    c.root !== root ||
    !Array.isArray(c.files) ||
    !c.files.every(
      (f) =>
        f &&
        typeof f.path === "string" &&
        typeof f.mtimeMs === "number" &&
        typeof f.size === "number" &&
        typeof f.text === "string",
    )
  )
    return { status: "discarded", files };
  // Cached entries are only reused for paths the next walk lists with the
  // same mtime+size, so the cache cannot introduce a path.
  for (const f of c.files) files.set(f.path, makeDoc(f.text, f.mtimeMs, f.size));
  return { status: "loaded", files };
}

function validateSearch(input: unknown): Required<Omit<SearchInput, "pathGlob">> & {
  pathGlob: string | null;
} {
  const i = input as Partial<SearchInput> | null;
  if (!i || typeof i !== "object")
    throw new CodeIndexError("INVALID_ARGUMENT", "search input must be an object");
  const query = typeof i.query === "string" ? i.query.trim() : "";
  if (!query || query.length > 512)
    throw new CodeIndexError("INVALID_ARGUMENT", "query must be 1-512 characters");
  if (
    i.pathGlob !== undefined &&
    (typeof i.pathGlob !== "string" || !i.pathGlob || i.pathGlob.length > 256)
  )
    throw new CodeIndexError("INVALID_ARGUMENT", "pathGlob must be 1-256 characters");
  const limit = i.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new CodeIndexError("INVALID_ARGUMENT", "limit must be an integer 1-100");
  return { query, pathGlob: i.pathGlob ?? null, limit };
}

type OutlineRule = { re: RegExp; kind?: string };
const TS_RULES: OutlineRule[] = [
  {
    re: /^(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?<kind>function\*?|class|interface|type|enum|const|let|var|namespace)\s+(?<name>[A-Za-z_$][\w$]*)/,
  },
];
const OUTLINE: Record<string, { language: string; rules: OutlineRule[] }> = {
  ts: { language: "typescript", rules: TS_RULES },
  tsx: { language: "typescript", rules: TS_RULES },
  mts: { language: "typescript", rules: TS_RULES },
  cts: { language: "typescript", rules: TS_RULES },
  js: { language: "javascript", rules: TS_RULES },
  jsx: { language: "javascript", rules: TS_RULES },
  mjs: { language: "javascript", rules: TS_RULES },
  cjs: { language: "javascript", rules: TS_RULES },
  py: {
    language: "python",
    rules: [{ re: /^(?:async\s+)?(?<kind>def|class)\s+(?<name>\w+)/ }],
  },
  rs: {
    language: "rust",
    rules: [
      {
        re: /^(?:pub(?:\([^)]*\))?\s+)?(?:(?:async|unsafe|const|extern(?:\s+"[^"]*")?)\s+)*(?<kind>fn|struct|enum|trait|mod|type|const|static|union)\s+(?<name>\w+)/,
      },
      { re: /^(?:unsafe\s+)?impl(?:<[^>]*>)?\s+(?<name>[^{]+?)\s*(?:\{|where\b|$)/, kind: "impl" },
      { re: /^macro_rules!\s*(?<name>\w+)/, kind: "macro" },
    ],
  },
  go: {
    language: "go",
    rules: [
      { re: /^func\s+\([^)]*\)\s*(?<name>\w+)/, kind: "method" },
      { re: /^func\s+(?<name>\w+)/, kind: "func" },
      { re: /^type\s+(?<name>\w+)/, kind: "type" },
      { re: /^(?<kind>var|const)\s+(?<name>\w+)/ },
    ],
  },
};

export interface CodeIndexOptions {
  /** Canonical absolute workspace root, supplied by native/engine. */
  root: string;
  /** Absolute cache directory under app data. */
  cacheDir: string;
  maxFileBytes?: number;
}

export class CodeIndex {
  readonly root: string;
  readonly cacheFile: string;
  readonly maxFileBytes: number;
  /** What happened to the persisted cache when this index was opened. */
  readonly cacheLoad: CacheLoad;
  #gen: Generation;
  #queue: Promise<unknown> = Promise.resolve();

  private constructor(
    root: string,
    cacheFile: string,
    maxFileBytes: number,
    loaded: { status: CacheLoad; files: Map<string, FileDoc> },
  ) {
    this.root = root;
    this.cacheFile = cacheFile;
    this.maxFileBytes = maxFileBytes;
    this.cacheLoad = loaded.status;
    this.#gen = finalize(loaded.files, []);
  }

  static async open(options: CodeIndexOptions): Promise<CodeIndex> {
    const root = canonicalRoot(options.root);
    if (typeof options.cacheDir !== "string" || !isAbsolute(options.cacheDir))
      throw new CodeIndexError("CACHE_DIR_INVALID", "cacheDir must be absolute");
    const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    mkdirSync(options.cacheDir, { recursive: true });
    const key = createHash("sha256").update(root).digest("hex").slice(0, 16);
    const cacheFile = join(options.cacheDir, `code-index-${key}.json`);
    const index = new CodeIndex(root, cacheFile, maxFileBytes, loadCache(cacheFile, root));
    await index.refresh();
    return index;
  }

  get links(): readonly IndexedLink[] {
    return this.#gen.links;
  }
  get fileCount(): number {
    return this.#gen.files.size;
  }

  /** Re-index changed files, drop deleted ones, then swap generations. */
  refresh(): Promise<RefreshReport> {
    const run = this.#queue.then(() => this.#refresh());
    this.#queue = run.catch(() => undefined); // the caller still sees `run` reject
    return run;
  }

  async #refresh(): Promise<RefreshReport> {
    const old = this.#gen;
    const { files, links } = listCandidates(this.root);
    const next = new Map<string, FileDoc>();
    const reindexed: string[] = [];
    const skipped: string[] = [];
    let reused = 0;
    for (const { rel, size, mtimeMs } of files) {
      if (size > this.maxFileBytes) {
        skipped.push(rel);
        continue;
      }
      // ponytail: mtime+size change detection; add a content hash if a
      // same-size same-mtime edit ever matters.
      const prev = old.files.get(rel);
      if (prev && prev.mtimeMs === mtimeMs && prev.size === size) {
        next.set(rel, prev);
        reused++;
        continue;
      }
      let buf: Buffer;
      try {
        buf = await readFile(join(this.root, rel));
      } catch {
        skipped.push(rel); // vanished or unreadable since listing
        continue;
      }
      if (buf.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
        skipped.push(rel);
        continue;
      }
      next.set(rel, makeDoc(buf.toString("utf8"), mtimeMs, size));
      reindexed.push(rel);
    }
    const removed = [...old.files.keys()].filter((p) => !next.has(p));
    this.#gen = finalize(next, links); // atomic cutover
    this.#save();
    return { reindexed, removed, reused, skipped, links: this.#gen.links };
  }

  #save(): void {
    const body: CacheFile = {
      version: CACHE_VERSION,
      root: this.root,
      files: [...this.#gen.files].map(([path, d]) => ({
        path,
        mtimeMs: d.mtimeMs,
        size: d.size,
        text: d.text,
      })),
    };
    const tmp = `${this.cacheFile}.${String(process.pid)}.tmp`;
    writeFileSync(tmp, JSON.stringify(body));
    renameSync(tmp, this.cacheFile);
  }

  /** BM25 over files; `"quoted"` parts are required exact phrases. */
  search(input: SearchInput): SearchHit[] {
    const g = this.#gen;
    const { query, pathGlob, limit } = validateSearch(input);
    const phrases = [...query.matchAll(/"([^"]+)"/g)].map((m) => m[1]!.toLowerCase());
    const terms = [...new Set(tokenize(query.replace(/"/g, " ")))];
    if (!terms.length) return [];
    const glob = pathGlob === null ? null : globRegExp(pathGlob);
    const n = g.files.size;
    const scores = new Map<string, number>();
    for (const t of terms) {
      const post = g.postings.get(t);
      if (!post) continue;
      const idf = Math.log(1 + (n - post.size + 0.5) / (post.size + 0.5));
      for (const [path, f] of post) {
        const d = g.files.get(path)!;
        const s = (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / g.avgLen));
        scores.set(path, (scores.get(path) ?? 0) + s);
      }
    }
    const ranked = [...scores]
      .filter(([path]) => !glob || glob.test(path))
      .filter(([path]) => {
        if (!phrases.length) return true;
        const text = g.files.get(path)!.text.toLowerCase();
        return phrases.every((p) => text.includes(p));
      })
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, limit);
    return ranked.map(([path, score]) => {
      const d = g.files.get(path)!;
      const i = bestLine(d.lines, terms, phrases);
      return {
        path,
        line: i + 1,
        preview: d.lines[i]!.trim().slice(0, 200),
        score: Math.round(score * 10000) / 10000,
      };
    });
  }

  /** Top-level symbols for an indexed file (path relative to root). */
  outline(path: unknown): OutlineResult {
    if (typeof path !== "string" || !path || path.length > 1024)
      throw new CodeIndexError("INVALID_ARGUMENT", "path must be 1-1024 characters");
    // Lookup only: never touches the filesystem, so it cannot escape the root.
    const doc = this.#gen.files.get(path.replace(/\\/g, "/"));
    if (!doc) return { status: "not_indexed" };
    const dot = path.lastIndexOf(".");
    const ext = dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
    const lang = OUTLINE[ext];
    if (!lang) return { status: "unsupported", language: ext || "none" };
    const symbols: OutlineSymbol[] = [];
    doc.lines.forEach((line, i) => {
      for (const rule of lang.rules) {
        const m = rule.re.exec(line);
        if (!m?.groups?.name) continue;
        symbols.push({
          name: m.groups.name.trim(),
          kind: rule.kind ?? m.groups.kind!.replace("*", ""),
          line: i + 1,
        });
        break;
      }
    });
    return { status: "ok", language: lang.language, symbols };
  }
}

function bestLine(lines: readonly string[], terms: string[], phrases: string[]): number {
  if (phrases.length) {
    const i = lines.findIndex((l) => l.toLowerCase().includes(phrases[0]!));
    if (i >= 0) return i;
  }
  let best = 0;
  let bestHits = 0;
  lines.forEach((l, i) => {
    const toks = new Set(tokenize(l));
    const hits = terms.filter((t) => toks.has(t)).length;
    if (hits > bestHits) {
      best = i;
      bestHits = hits;
    }
  });
  return best;
}

export interface CodeIndexTool {
  name: "code_search" | "code_outline";
  description: string;
  readOnly: true;
  /** JSON Schema for the model-supplied arguments. */
  parameters: Record<string, unknown>;
  execute(args: unknown): Promise<unknown>;
}

/**
 * Read-only agent tools over one workspace index. Each call refreshes first
 * (incremental), so results reflect the agent's own edits.
 */
// ponytail: refresh-per-call (git ls-files + lstat); add a watcher if
// latency on very large workspaces matters.
export function codeIndexTools(index: CodeIndex): readonly CodeIndexTool[] {
  return Object.freeze([
    {
      name: "code_search",
      description:
        'Search the workspace by identifiers and words (camelCase/snake_case aware, BM25 ranked). Wrap text in "double quotes" to require an exact phrase; pathGlob filters paths relative to the workspace root (e.g. "src/**/*.ts").',
      readOnly: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 512 },
          pathGlob: { type: "string", minLength: 1, maxLength: 256 },
          limit: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
      async execute(args: unknown) {
        await index.refresh();
        return { results: index.search(args as SearchInput) };
      },
    },
    {
      name: "code_outline",
      description:
        "List top-level symbols of a workspace file (path relative to the root). Supports ts/js/py/rs/go; other files report unsupported.",
      readOnly: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: { path: { type: "string", minLength: 1, maxLength: 1024 } },
      },
      async execute(args: unknown) {
        const a = args as { path?: unknown } | null;
        if (!a || typeof a !== "object")
          throw new CodeIndexError("INVALID_ARGUMENT", "outline input must be an object");
        await index.refresh();
        return index.outline(a.path);
      },
    },
  ] as const);
}
