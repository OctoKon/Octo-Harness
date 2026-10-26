// TD-24: immutable candidate/input manifest with stale-verification.
// Erasable-syntax-only (runs under Node type stripping).

import { createHash } from "node:crypto";
import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

export class SnapshotError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SnapshotError";
    this.code = code;
  }
}

export interface SnapshotEntry {
  path: string;
  sha256: string;
}

export interface SnapshotManifest {
  tracked: SnapshotEntry[];
  untracked: SnapshotEntry[];
  excluded: string[];
}

export interface SnapshotOptions {
  exclude?: string[];
}

const manifestStore = new Map<number, SnapshotManifest>();
let seqCounter = 0;

export class Snapshot {
  readonly manifest: SnapshotManifest;

  constructor(manifest: SnapshotManifest) {
    this.manifest = Object.freeze({
      tracked: Object.freeze(manifest.tracked.map((e) => Object.freeze({ ...e }))),
      untracked: Object.freeze(
        manifest.untracked.map((e) => Object.freeze({ ...e })),
      ),
      excluded: Object.freeze([...manifest.excluded]),
    }) as SnapshotManifest;
    Object.freeze(this);
  }

  static fromManifest(manifest: SnapshotManifest): Snapshot {
    return new Snapshot(manifest);
  }

  persist(_store: unknown): { seq: number } {
    seqCounter += 1;
    const seq = seqCounter;
    manifestStore.set(seq, this.manifest);
    return { seq };
  }

  static load(_store: unknown, seq: number): Snapshot {
    const m = manifestStore.get(seq);
    if (!m) {
      throw new SnapshotError("NOT_FOUND", `snapshot seq ${seq} not found`);
    }
    return new Snapshot(m);
  }
}

function sha256File(path: string): string {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

function isExcluded(relPath: string, patterns: string[]): boolean {
  for (const pat of patterns) {
    // simple glob: *.ext
    if (pat.startsWith("*.")) {
      const ext = pat.slice(1);
      if (relPath.endsWith(ext)) return true;
    } else if (relPath === pat) {
      return true;
    }
  }
  return false;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (base: string, prefix: string) => {
    let entries: string[];
    try {
      entries = readdirSync(base);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === ".git") continue;
      const full = join(base, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full, prefix ? `${prefix}/${name}` : name);
      } else if (st.isFile()) {
        out.push(prefix ? `${prefix}/${name}` : name);
      }
    }
  };
  walk(dir, "");
  return out;
}

function gitTrackedSet(dir: string): Set<string> | null {
  try {
    const out = execSync("git ls-files", { cwd: dir, encoding: "utf8" });
    return new Set(out.split(/\r?\n/).filter(Boolean));
  } catch {
    return null;
  }
}

function gitUntrackedSet(dir: string): Set<string> | null {
  try {
    const out = execSync("git ls-files --others --exclude-standard", {
      cwd: dir,
      encoding: "utf8",
    });
    return new Set(out.split(/\r?\n/).filter(Boolean));
  } catch {
    return null;
  }
}

export function createSnapshot(
  dir: string,
  options?: SnapshotOptions,
): Snapshot {
  const exclude = options?.exclude ?? [];
  const files = listFiles(dir);
  const trackedSet = gitTrackedSet(dir);
  const untrackedSet = gitUntrackedSet(dir);

  const tracked: SnapshotEntry[] = [];
  const untracked: SnapshotEntry[] = [];

  for (const rel of files) {
    if (isExcluded(rel, exclude)) continue;
    const entry: SnapshotEntry = { path: rel, sha256: sha256File(join(dir, rel)) };
    if (trackedSet === null) {
      // non-git: treat all as tracked
      tracked.push(entry);
    } else {
      if (trackedSet.has(rel)) tracked.push(entry);
      else if (untrackedSet?.has(rel)) untracked.push(entry);
      else tracked.push(entry); // default
    }
  }

  if (tracked.length === 0 && untracked.length === 0) {
    throw new SnapshotError("EMPTY_SNAPSHOT", "directory has no snapshot entries");
  }

  return new Snapshot({
    tracked,
    untracked,
    excluded: exclude,
  });
}

export function verifyStale(snapshot: Snapshot, dir: string): void {
  // Re-hash all relevant (non-excluded) files and compare to manifest.
  const manifest = snapshot.manifest;
  const allEntries = [...manifest.tracked, ...manifest.untracked];
  for (const entry of allEntries) {
    let current: string;
    try {
      current = sha256File(join(dir, entry.path));
    } catch {
      throw new SnapshotError("STALE_RELEVANT_BYTES", `missing file ${entry.path}`);
    }
    if (current !== entry.sha256) {
      throw new SnapshotError(
        "STALE_RELEVANT_BYTES",
        `relevant bytes changed for ${entry.path}`,
      );
    }
  }
  // Also check that no new relevant files appeared.
  const exclude = manifest.excluded;
  const currentFiles = listFiles(dir).filter((f) => !isExcluded(f, exclude));
  const known = new Set(allEntries.map((e) => e.path));
  for (const f of currentFiles) {
    if (!known.has(f)) {
      throw new SnapshotError("STALE_RELEVANT_BYTES", `new relevant file ${f}`);
    }
  }
}