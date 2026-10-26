// TD-09: physical authoritative store (J0). Built-in `node:sqlite` adapter per
// the TD-03 store-qualification selection (fallback: better-sqlite3 13.0.3,
// never both). Single authority for operational receipts; everything else is a
// rebuildable projection. Erasable-syntax-only (runs under Node type stripping).

import {
  CONTRACT_VERSION,
  ContractError,
  type ContractContext,
  type RecordKind,
  type RecordByKind,
  validateRecord,
} from "./contracts.js";
import { DatabaseSync } from "node:sqlite";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const LAYOUT_VERSION = 1 as const;

export class StoreError extends Error {
  readonly code: string;
  readonly errcode: number | undefined;

  constructor(code: string, message: string, errcode?: number) {
    super(message);
    this.name = "StoreError";
    this.code = code;
    this.errcode = errcode;
  }
}

export interface StoreOptions {
  /** SQLite busy timeout in ms. Default 5000 — `node:sqlite` defaults to 0. */
  busyTimeoutMs?: number;
  /** Contract context `maxInlineBytes` used while validating appended records. */
  maxInlineBytes?: number;
  /** Open the underlying database read-only (S3). */
  readOnly?: boolean;
}

export interface CallerContext {
  sessionId: string;
  configRevision: string;
  profileRevision: string;
  policyRevision: string;
  resolveReference?: (id: string, scopeId: string) => boolean;
}

export interface AppendInput {
  kind: RecordKind;
  record: unknown;
}

export interface Appended {
  seq: number;
  recordId: string;
}

export interface StoredRecord {
  seq: number;
  kind: RecordKind;
  record: RecordByKind[RecordKind];
}

export interface ListResult {
  records: StoredRecord[];
  /** Rows with an unknown (future) `schemaVersion` — rejected, not read (S5). */
  skippedUnknownSchema: number;
}

export interface AppendBatchResult {
  /** Acknowledged seqs, one per input, in input order. */
  seqs: number[];
}

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Discriminates a SQLite failure by its result code, not the JS error class. */
function mapSqliteError(error: unknown): StoreError {
  if (isRecordObject(error) && typeof error.errcode === "number") {
    const errcode = error.errcode;
    if (errcode === 26)
      return new StoreError(
        "STORE_CORRUPT",
        "database file is not a valid SQLite database (SQLITE_NOTADB)",
        errcode,
      );
    if (errcode === 8)
      return new StoreError(
        "STORE_READ_ONLY",
        "attempt to write a read-only database (SQLITE_READONLY)",
        errcode,
      );
    if (errcode === 5)
      return new StoreError(
        "STORE_BUSY",
        "database is locked by another writer (SQLITE_BUSY)",
        errcode,
      );
    if (errcode === 13)
      return new StoreError(
        "STORE_FULL",
        "database or disk is full (SQLITE_FULL)",
        errcode,
      );
    if (errcode === 11)
      return new StoreError(
        "STORE_CORRUPT",
        "database disk image is malformed (SQLITE_CORRUPT)",
        errcode,
      );
    const message = typeof error.message === "string" ? error.message : "";
    return new StoreError("STORE_SQLITE_ERROR", message, errcode);
  }
  if (error instanceof ContractError)
    return new StoreError(`CONTRACT_${error.code}`, error.message);
  return new StoreError(
    "STORE_UNKNOWN",
    error instanceof Error ? error.message : String(error),
  );
}

export class Store {
  readonly path: string;
  /** @internal the underlying SQLite handle; reassigned only by restore(). */
  db: DatabaseSync;
  private readonly busyTimeoutMs: number;
  private readonly maxInlineBytes: number;
  /** @internal closed flag; reset only by restore(). */
  closed = false;

  private constructor(
    path: string,
    db: DatabaseSync,
    busyTimeoutMs: number,
    maxInlineBytes: number,
  ) {
    this.path = path;
    this.db = db;
    this.busyTimeoutMs = busyTimeoutMs;
    this.maxInlineBytes = maxInlineBytes;
  }

  /** Opens (or creates) the store and fails closed on an unknown layout. */
  static open(path: string, options: StoreOptions = {}): Store {
    const busyTimeoutMs = options.busyTimeoutMs ?? 5000;
    const maxInlineBytes = options.maxInlineBytes ?? 65536;
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(path, {
        timeout: busyTimeoutMs,
        readOnly: options.readOnly === true,
      });
    } catch (error) {
      throw mapSqliteError(error);
    }
    try {
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA synchronous = FULL;");
      db.exec("PRAGMA foreign_keys = ON;");
      db.exec(`PRAGMA busy_timeout = ${String(busyTimeoutMs)};`);
      db.exec(
        "CREATE TABLE IF NOT EXISTS store_meta (" +
          "key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      );
      const row = db
        .prepare("SELECT value FROM store_meta WHERE key = 'layout_version'")
        .get() as { value: string } | undefined;
      if (row === undefined) {
        db.prepare(
          "INSERT INTO store_meta (key, value) VALUES ('layout_version', ?)",
        ).run(String(LAYOUT_VERSION));
        Store.createSchema(db);
      } else if (row.value !== String(LAYOUT_VERSION)) {
        throw new StoreError(
          "STORE_LAYOUT",
          `store layout version ${row.value} is not supported (expected ${String(LAYOUT_VERSION)})`,
        );
      }
      return new Store(path, db, busyTimeoutMs, maxInlineBytes);
    } catch (error) {
      try {
        db.close();
      } catch {
        // the original failure is the reportable one
      }
      throw error instanceof StoreError ? error : mapSqliteError(error);
    }
  }

  private static createSchema(db: DatabaseSync): void {
    db.exec(
      "CREATE TABLE IF NOT EXISTS records (" +
        "seq INTEGER PRIMARY KEY AUTOINCREMENT, " +
        "kind TEXT NOT NULL, " +
        "record_id TEXT NOT NULL UNIQUE, " +
        "schema_version INTEGER NOT NULL, " +
        "scope_id TEXT NOT NULL, " +
        "created_at TEXT NOT NULL, " +
        "payload TEXT NOT NULL)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS records_scope_seq " +
        "ON records (scope_id, seq)",
    );
    db.exec(
      "CREATE TABLE IF NOT EXISTS deletions (" +
        "record_id TEXT PRIMARY KEY, " +
        "generation INTEGER NOT NULL, " +
        "deleted_at TEXT NOT NULL)",
    );
  }

  private assertOpen(): void {
    if (this.closed) throw new StoreError("STORE_CLOSED", "store is closed");
  }

  /** Durable cursor: highest committed seq (0 for an empty scope/store). */
  cursor(scopeId?: string): number {
    this.assertOpen();
    const sql =
      scopeId === undefined
        ? "SELECT COALESCE(MAX(seq), 0) AS s FROM records"
        : "SELECT COALESCE(MAX(seq), 0) AS s FROM records WHERE scope_id = ?";
    const row = (
      scopeId === undefined
        ? this.db.prepare(sql).get()
        : this.db.prepare(sql).get(scopeId)
    ) as { s: number | bigint };
    return Number(row.s);
  }

  private context(scopeId: string, caller: CallerContext): ContractContext {
    return {
      scopeId,
      sessionId: caller.sessionId,
      configRevision: caller.configRevision,
      profileRevision: caller.profileRevision,
      policyRevision: caller.policyRevision,
      lastDurableSeq: this.cursor(),
      maxInlineBytes: this.maxInlineBytes,
      resolveReference:
        caller.resolveReference ?? ((_id: string, _scopeId: string) => false),
    };
  }

  private insertValidated(
    kind: RecordKind,
    record: RecordByKind[RecordKind],
  ): number {
    const result = this.db
      .prepare(
        "INSERT INTO records (kind, record_id, schema_version, scope_id, created_at, payload) " +
          "VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        kind,
        record.recordId,
        CONTRACT_VERSION,
        record.scopeId,
        record.createdAt,
        JSON.stringify(record),
      );
    return Number(result.lastInsertRowid);
  }

  /**
   * Validates against the frozen contract with the store's own durable cursor,
   * then commits. A returned success is durable; a thrown error acknowledges
   * nothing.
   */
  append(input: AppendInput, caller: CallerContext): Appended {
    this.assertOpen();
    const recordObject = input.record as Record<string, unknown> | undefined;
    const scopeId =
      isRecordObject(recordObject) && typeof recordObject.scopeId === "string"
        ? recordObject.scopeId
        : "";
    let validated: RecordByKind[RecordKind];
    try {
      validated = validateRecord(
        input.kind,
        input.record,
        this.context(scopeId, caller),
      );
    } catch (error) {
      throw mapSqliteError(error);
    }
    try {
      const seq = this.insertValidated(input.kind, validated);
      return { seq, recordId: validated.recordId };
    } catch (error) {
      throw mapSqliteError(error);
    }
  }

  /**
   * Ordered, atomic receipt commits: every input is validated first, then all
   * are committed in input order in one transaction. Any failure rolls the
   * whole batch back — no partial receipt chain is ever acknowledged.
   */
  appendBatch(
    inputs: readonly AppendInput[],
    caller: CallerContext,
  ): AppendBatchResult {
    this.assertOpen();
    if (inputs.length === 0) return { seqs: [] };
    const prepared: Array<[RecordKind, RecordByKind[RecordKind]]> = [];
    try {
      for (const input of inputs) {
        const recordObject = input.record as Record<string, unknown>;
        const scopeId =
          isRecordObject(recordObject) &&
          typeof recordObject.scopeId === "string"
            ? recordObject.scopeId
            : "";
        prepared.push([
          input.kind,
          validateRecord(
            input.kind,
            input.record,
            this.context(scopeId, caller),
          ),
        ]);
      }
    } catch (error) {
      throw mapSqliteError(error);
    }
    try {
      this.db.exec("BEGIN IMMEDIATE;");
      const seqs: number[] = [];
      for (const [kind, record] of prepared) {
        seqs.push(this.insertValidated(kind, record));
      }
      this.db.exec("COMMIT;");
      return { seqs };
    } catch (error) {
      try {
        if (this.db.isTransaction()) this.db.exec("ROLLBACK;");
      } catch {
        // fall through to the reportable error
      }
      throw mapSqliteError(error);
    }
  }

  private readRow(row: unknown): StoredRecord {
    const r = row as {
      seq: number | bigint;
      kind: string;
      schema_version: number | bigint;
      payload: string;
    };
    if (Number(r.schema_version) !== CONTRACT_VERSION) {
      throw new StoreError(
        "UNKNOWN_SCHEMA",
        `record ${r.kind} carries schemaVersion ${String(r.schema_version)}; this store reads ${String(CONTRACT_VERSION)}`,
      );
    }
    return {
      seq: Number(r.seq),
      kind: r.kind as RecordKind,
      record: JSON.parse(r.payload) as RecordByKind[RecordKind],
    };
  }

  /** Reads one record by id; unknown contract versions are rejected (S5). */
  get(recordId: string): StoredRecord {
    this.assertOpen();
    const row = this.db
      .prepare(
        "SELECT seq, kind, schema_version, payload FROM records WHERE record_id = ?",
      )
      .get(recordId);
    if (row === undefined)
      throw new StoreError("STORE_NOT_FOUND", `no record ${recordId}`);
    return this.readRow(row);
  }

  /** Ordered read of a scope's records after a cursor. */
  list(scopeId: string, afterSeq = 0): ListResult {
    this.assertOpen();
    const rows = this.db
      .prepare(
        "SELECT seq, kind, schema_version, payload FROM records " +
          "WHERE scope_id = ? AND seq > ? ORDER BY seq ASC",
      )
      .all(scopeId, afterSeq) as unknown[];
    const records: StoredRecord[] = [];
    let skippedUnknownSchema = 0;
    for (const row of rows) {
      try {
        records.push(this.readRow(row));
      } catch (error) {
        if (error instanceof StoreError && error.code === "UNKNOWN_SCHEMA") {
          skippedUnknownSchema += 1;
          continue;
        }
        throw error;
      }
    }
    return { records, skippedUnknownSchema };
  }

  /**
   * Records a deletion tombstone; the generation advances monotonically and is
   * carried in backups so a stale restore is refused.
   */
  noteDeletion(recordId: string): number {
    this.assertOpen();
    try {
      this.db.exec("BEGIN IMMEDIATE;");
      const previous = this.db
        .prepare("SELECT generation FROM deletions WHERE record_id = ?")
        .get(recordId) as { generation: number | bigint } | undefined;
      const generation =
        (previous === undefined ? 0 : Number(previous.generation)) + 1;
      this.db
        .prepare(
          "INSERT INTO deletions (record_id, generation, deleted_at) VALUES (?, ?, ?) " +
            "ON CONFLICT(record_id) DO UPDATE SET generation = excluded.generation, deleted_at = excluded.deleted_at",
        )
        .run(recordId, generation, new Date().toISOString());
      this.db.exec("COMMIT;");
      return generation;
    } catch (error) {
      try {
        if (this.db.isTransaction()) this.db.exec("ROLLBACK;");
      } catch {
        // fall through to the reportable error
      }
      throw mapSqliteError(error);
    }
  }

  private deletionGeneration(db: DatabaseSync): number {
    const row = db
      .prepare("SELECT COALESCE(MAX(generation), 0) AS g FROM deletions")
      .get() as { g: number | bigint };
    return Number(row.g);
  }

  /** Consistent backup through SQLite itself (`VACUUM INTO`), never a raw copy. */
  backup(targetPath: string): void {
    this.assertOpen();
    try {
      this.db.exec(`VACUUM INTO '${targetPath.replaceAll("'", "''")}'`);
    } catch (error) {
      throw mapSqliteError(error);
    }
  }

  /** Highest deletion generation recorded in a (backup) database file. */
  static deletionGenerationOf(dbPath: string): number {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      return new Store("", db, 0, 0).deletionGeneration(db);
    } finally {
      db.close();
    }
  }

  /**
   * Restores a backup. Refuses a stale restore: if any deletion generation has
   * advanced past the snapshot, the quarantine ordering is preserved.
   */
  restore(backupPath: string): void {
    this.assertOpen();
    const backupGeneration = Store.deletionGenerationOf(backupPath);
    const liveGeneration = this.deletionGeneration(this.db);
    if (backupGeneration < liveGeneration)
      throw new StoreError(
        "STALE_RESTORE",
        `backup deletion generation ${String(backupGeneration)} is older than current ${String(liveGeneration)}`,
      );
    this.close();
    try {
      for (const suffix of ["-wal", "-shm"])
        if (existsSync(this.path + suffix)) rmSync(this.path + suffix);
      copyFileSync(backupPath, this.path);
    } finally {
      const reopened = Store.open(this.path, {
        busyTimeoutMs: this.busyTimeoutMs,
        maxInlineBytes: this.maxInlineBytes,
      });
      // take over the reopened handle (internal fields, see class docs)
      this.db = reopened.db;
      this.closed = false;
    }
  }

  /** S8 export: one JSON line per record, `{seq, kind, record}`. */
  exportJSONL(targetPath: string, scopeId?: string): number {
    this.assertOpen();
    const rows =
      scopeId === undefined
        ? (this.db
            .prepare(
              "SELECT seq, kind, schema_version, payload FROM records ORDER BY seq ASC",
            )
            .all() as unknown[])
        : (this.db
            .prepare(
              "SELECT seq, kind, schema_version, payload FROM records WHERE scope_id = ? ORDER BY seq ASC",
            )
            .all(scopeId) as unknown[]);
    const lines: string[] = [];
    for (const row of rows) {
      const stored = this.readRow(row);
      lines.push(
        JSON.stringify({
          seq: stored.seq,
          kind: stored.kind,
          record: stored.record,
        }),
      );
    }
    writeFileSync(
      targetPath,
      lines.join("\n") + (lines.length ? "\n" : ""),
      "utf8",
    );
    return lines.length;
  }

  /** S8 import: replays a JSONL export into this store in file order. */
  importJSONL(sourcePath: string, caller: CallerContext): number {
    this.assertOpen();
    const text = readFileSync(sourcePath, "utf8");
    const inputs: AppendInput[] = [];
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      const entry = JSON.parse(line) as { kind: string; record: unknown };
      inputs.push({ kind: entry.kind as RecordKind, record: entry.record });
    }
    this.appendBatch(inputs, caller);
    return inputs.length;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.db.close();
    } catch (error) {
      throw mapSqliteError(error);
    }
  }
}
