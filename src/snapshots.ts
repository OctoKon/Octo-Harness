// TD-24: immutable candidate/input manifest with stale-verification.
// Erasable-syntax-only (runs under Node type stripping).
//
// Persistence is Store-backed, not process-local: `persist` writes the
// manifest bytes to a content file and then commits a frozen-contract
// `artifact` record (digest, byteLength, mediaType) through TD-09's Store.
// The store's acknowledged seq/recordId is the authority; the file is
// content addressed by that record's digest and fails closed on any
// mismatch, so a manifest can never be read back as verified after a
// crash, a truncation or an edit.

import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { CONTRACT_VERSION } from "@splyce/pi/contracts";

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

/** Media type of a persisted manifest, recorded on the artifact record. */
export const SNAPSHOT_MEDIA_TYPE =
  "application/vnd.splyce.snapshot-manifest+json";

/**
 * The store surface TD-24 depends on: TD-09's `Store` satisfies it. Nothing
 * is persisted outside the store's own acknowledged record plus the content
 * file that record's digest addresses.
 */
export interface SnapshotStore {
  readonly path: string;
  append(
    input: { kind: "artifact"; record: unknown },
    caller: SnapshotCaller,
  ): { seq: number; recordId: string };
  get(recordId: string): { seq: number; kind: string; record: unknown };
}

/** Append caller; recorded on every snapshot record. */
export interface SnapshotCaller {
  sessionId: string;
  configRevision: string;
  profileRevision: string;
  policyRevision: string;
  resolveReference?: (id: string, scopeId: string) => boolean;
}

const DEFAULT_CALLER: SnapshotCaller = {
  sessionId: "snapshot",
  configRevision: "cfg-0",
  profileRevision: "profile-0",
  policyRevision: "policy-0",
  resolveReference: () => true,
};

const DEFAULT_SCOPE = "w-snapshot";

/** Content files live beside the store database, addressed by recordId. */
function contentPath(storePath: string, recordId: string): string {
  return join(dirname(storePath), "snapshots", `${recordId}.json`);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export class Snapshot {
  readonly manifest: SnapshotManifest;
  readonly seq: number | undefined;
  readonly recordId: string | undefined;

  constructor(
    manifest: SnapshotManifest,
    meta?: { seq?: number; recordId?: string },
  ) {
    this.manifest = Object.freeze({
      tracked: Object.freeze(
        manifest.tracked.map((e) => Object.freeze({ ...e })),
      ),
      untracked: Object.freeze(
        manifest.untracked.map((e) => Object.freeze({ ...e })),
      ),
      excluded: Object.freeze([...manifest.excluded]),
    }) as SnapshotManifest;
    this.seq = meta?.seq;
    this.recordId = meta?.recordId;
    Object.freeze(this);
  }

  static fromManifest(manifest: SnapshotManifest): Snapshot {
    return new Snapshot(manifest);
  }

  /**
   * Commit this manifest durably: content file first, then the acknowledged
   * store record. If the append fails nothing is acknowledged and the
   * orphaned content file is removed, so a returned `{seq, recordId}` always
   * names a record that `Snapshot.load` can read back.
   */
  persist(
    store: SnapshotStore,
    options?: Partial<SnapshotCaller> & { scopeId?: string },
  ): { seq: number; recordId: string; digest: string } {
    const bytes = Buffer.from(JSON.stringify(this.manifest), "utf8");
    const digest = `sha256:${sha256(bytes)}`;
    const recordId = `snap-${randomUUID()}`;
    const target = contentPath(store.path, recordId);
    const temp = `${target}.tmp`;

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(temp, bytes);
    renameSync(temp, target);

    let appended: { seq: number; recordId: string };
    try {
      appended = store.append(
        {
          kind: "artifact",
          record: {
            schemaVersion: CONTRACT_VERSION,
            recordId,
            createdAt: new Date().toISOString(),
            scopeId: options?.scopeId ?? DEFAULT_SCOPE,
            sourceIds: [],
            artifactId: recordId,
            digest,
            mediaType: SNAPSHOT_MEDIA_TYPE,
            byteLength: bytes.length,
            retentionClass: "persistent",
          },
        },
        {
          sessionId: options?.sessionId ?? DEFAULT_CALLER.sessionId,
          configRevision:
            options?.configRevision ?? DEFAULT_CALLER.configRevision,
          profileRevision:
            options?.profileRevision ?? DEFAULT_CALLER.profileRevision,
          policyRevision:
            options?.policyRevision ?? DEFAULT_CALLER.policyRevision,
          resolveReference:
            options?.resolveReference ?? DEFAULT_CALLER.resolveReference,
        },
      );
    } catch (error) {
      // Nothing was acknowledged: drop the content we just staged.
      try {
        unlinkSync(target);
      } catch {
        /* already gone */
      }
      throw error;
    }

    return { seq: appended.seq, recordId: appended.recordId, digest };
  }

  /**
   * Read a previously acknowledged snapshot back from the store. Every
   * failure mode is explicit and fails closed: unknown record, wrong record
   * kind, missing content, or content that no longer matches the digest and
   * byteLength the store acknowledged.
   */
  static load(store: SnapshotStore, recordId: string): Snapshot {
    let stored: { seq: number; kind: string; record: unknown };
    try {
      stored = store.get(recordId);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "STORE_NOT_FOUND") {
        throw new SnapshotError(
          "NOT_FOUND",
          `snapshot record ${recordId} not found`,
        );
      }
      throw error;
    }

    if (stored.kind !== "artifact") {
      throw new SnapshotError(
        "NOT_A_SNAPSHOT",
        `record ${recordId} is a ${stored.kind} record, not a snapshot manifest`,
      );
    }

    const record = stored.record as {
      digest?: unknown;
      mediaType?: unknown;
      byteLength?: unknown;
    };
    if (record.mediaType !== SNAPSHOT_MEDIA_TYPE) {
      throw new SnapshotError(
        "NOT_A_SNAPSHOT",
        `record ${recordId} has media type ${String(record.mediaType)}`,
      );
    }

    const target = contentPath(store.path, recordId);
    let bytes: Buffer;
    try {
      bytes = readFileSync(target);
    } catch {
      throw new SnapshotError(
        "CONTENT_MISSING",
        `snapshot content for ${recordId} is missing at ${target}`,
      );
    }

    if (bytes.length !== record.byteLength) {
      throw new SnapshotError(
        "DIGEST_MISMATCH",
        `snapshot content for ${recordId} is ${bytes.length} bytes, store acknowledged ${String(record.byteLength)}`,
      );
    }
    const digest = `sha256:${sha256(bytes)}`;
    if (digest !== record.digest) {
      throw new SnapshotError(
        "DIGEST_MISMATCH",
        `snapshot content for ${recordId} does not match the acknowledged digest`,
      );
    }

    let manifest: SnapshotManifest;
    try {
      manifest = JSON.parse(bytes.toString("utf8")) as SnapshotManifest;
    } catch {
      throw new SnapshotError(
        "DIGEST_MISMATCH",
        `snapshot content for ${recordId} is not a manifest`,
      );
    }
    return new Snapshot(manifest, { seq: stored.seq, recordId });
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
    const entry: SnapshotEntry = {
      path: rel,
      sha256: sha256File(join(dir, rel)),
    };
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
    throw new SnapshotError(
      "EMPTY_SNAPSHOT",
      "directory has no snapshot entries",
    );
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
      throw new SnapshotError(
        "STALE_RELEVANT_BYTES",
        `missing file ${entry.path}`,
      );
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
