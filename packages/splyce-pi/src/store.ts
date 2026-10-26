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

const RECORD_COLUMNS = [
  "seq",
  "kind",
  "record_id",
  "schema_version",
  "scope_id",
  "created_at",
  "payload",
] as const;

const DELETION_COLUMNS = ["record_id", "generation", "deleted_at"] as const;

const OWNERSHIP_COLUMNS = [
  "workspace_id",
  "owner_session_id",
  "epoch",
  "acquired_at",
  "renewed_at",
] as const;

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

/** Durable canonical-workspace ownership: single writer per workspace. */
export interface WorkspaceOwnership {
  workspaceId: string;
  ownerSessionId: string;
  epoch: number;
}

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Discriminates a SQLite failure by its result code, not the JS error class. */
function mapSqliteError(error: unknown): StoreError {
  if (error instanceof StoreError) return error;
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
    private readonly readOnly: boolean,
  ) {
    this.path = path;
    this.db = db;
    this.busyTimeoutMs = busyTimeoutMs;
    this.maxInlineBytes = maxInlineBytes;
  }

  private static tableColumns(db: DatabaseSync, table: string): Set<string> {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    return new Set(rows.map((row) => row.name));
  }

  /** Validates a stamped store's shape without creating anything. */
  private static validateStamped(
    db: DatabaseSync,
    stampedVersion: string,
  ): void {
    if (stampedVersion !== String(LAYOUT_VERSION))
      throw new StoreError(
        "STORE_LAYOUT",
        `store layout version ${stampedVersion} is not supported (expected ${String(LAYOUT_VERSION)})`,
      );
    const required: Array<[string, readonly string[]]> = [
      ["records", RECORD_COLUMNS],
      ["deletions", DELETION_COLUMNS],
      ["workspace_ownership", OWNERSHIP_COLUMNS],
    ];
    for (const [table, columns] of required) {
      const present = Store.tableColumns(db, table);
      const missing = columns.filter((column) => !present.has(column));
      if (missing.length > 0)
        throw new StoreError(
          "STORE_LAYOUT",
          `store claims layout ${stampedVersion} but table ${table} lacks columns: ${missing.join(", ")}`,
        );
    }
  }

  /** Opens (or creates) the store; initialization is one atomic transaction
   * and an existing store must match the expected shape or we fail closed. */
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
      // Read-only opens never initialize: they validate the stamped layout
      // without a write transaction and reject appends explicitly (S3).
      if (options.readOnly === true) {
        db.exec(`PRAGMA busy_timeout = ${String(busyTimeoutMs)};`);
        const stamped = db
          .prepare("SELECT value FROM store_meta WHERE key = 'layout_version'")
          .get() as { value: string } | undefined;
        if (stamped === undefined)
          throw new StoreError(
            "STORE_LAYOUT",
            "store is not initialized; read-only open requires a stamped layout",
          );
        Store.validateStamped(db, stamped.value);
        return new Store(path, db, busyTimeoutMs, maxInlineBytes, true);
      }
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA synchronous = FULL;");
      db.exec("PRAGMA foreign_keys = ON;");
      db.exec(`PRAGMA busy_timeout = ${String(busyTimeoutMs)};`);
      // Initialization is one transaction with fail-closed semantics: an
      // existing store stamped version 1 is validated, never healed; a fresh
      // file has the schema created and stamped atomically.
      db.exec("BEGIN IMMEDIATE;");
      db.exec(
        "CREATE TABLE IF NOT EXISTS store_meta (" +
          "key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      );
      const row = db
        .prepare("SELECT value FROM store_meta WHERE key = 'layout_version'")
        .get() as { value: string } | undefined;
      if (row === undefined) {
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
        db.exec(
          "CREATE TABLE IF NOT EXISTS workspace_ownership (" +
            "workspace_id TEXT PRIMARY KEY, " +
            "owner_session_id TEXT NOT NULL, " +
            "epoch INTEGER NOT NULL, " +
            "acquired_at TEXT NOT NULL, " +
            "renewed_at TEXT NOT NULL)",
        );
        db.prepare(
          "INSERT INTO store_meta (key, value) VALUES ('layout_version', ?)",
        ).run(String(LAYOUT_VERSION));
      } else {
        Store.validateStamped(db, row.value);
      }
      db.exec("COMMIT;");
      return new Store(path, db, busyTimeoutMs, maxInlineBytes, false);
    } catch (error) {
      try {
        if (db.isTransaction) db.exec("ROLLBACK;");
      } catch {
        // the original failure is the reportable one
      }
      try {
        db.close();
      } catch {
        // the original failure is the reportable one
      }
      throw error instanceof StoreError ? error : mapSqliteError(error);
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new StoreError("STORE_CLOSED", "store is closed");
  }

  /** Write paths reject a read-only store explicitly before any write attempt. */
  private assertWritable(): void {
    this.assertOpen();
    if (this.readOnly)
      throw new StoreError(
        "STORE_READ_ONLY",
        "store was opened read-only; writes are rejected explicitly",
        8,
      );
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
   * nothing and leaves the store rollable/reopenable.
   */
  append(input: AppendInput, caller: CallerContext): Appended {
    this.assertWritable();
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
   * are committed in input order in one transaction. Any failure — including a
   * mid-batch constraint violation — rolls the whole batch back: the cursor
   * observable from a fresh connection is unchanged and the next write
   * succeeds on a clean handle.
   */
  appendBatch(
    inputs: readonly AppendInput[],
    caller: CallerContext,
  ): AppendBatchResult {
    this.assertWritable();
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
      let rollbackError: unknown;
      try {
        if (this.db.isTransaction) this.db.exec("ROLLBACK;");
      } catch (rollback) {
        rollbackError = rollback;
      }
      if (rollbackError !== undefined) {
        // A failed rollback is never silent: the store cannot guarantee
        // durability state afterwards, so report both causes.
        throw new StoreError(
          "STORE_ROLLBACK_FAILED",
          `batch failed (${error instanceof Error ? error.message : String(error)}) and rollback also failed (${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)})`,
        );
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

  private metaGet(key: string): number {
    const row = this.db
      .prepare("SELECT value FROM store_meta WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row === undefined ? 0 : Number(row.value);
  }

  /**
   * Records a deletion tombstone under a globally monotonic deletion epoch
   * persisted in `store_meta`. The epoch is what backups carry, so a restore
   * that would drop any tombstone is refused.
   */
  noteDeletion(recordId: string): number {
    this.assertWritable();
    try {
      this.db.exec("BEGIN IMMEDIATE;");
      const epoch = this.metaGet("deletion_epoch") + 1;
      this.db
        .prepare(
          "INSERT INTO deletions (record_id, generation, deleted_at) VALUES (?, ?, ?) " +
            "ON CONFLICT(record_id) DO UPDATE SET generation = excluded.generation, deleted_at = excluded.deleted_at",
        )
        .run(recordId, epoch, new Date().toISOString());
      this.db
        .prepare(
          "INSERT INTO store_meta (key, value) VALUES ('deletion_epoch', ?) " +
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(String(epoch));
      this.db.exec("COMMIT;");
      return epoch;
    } catch (error) {
      try {
        if (this.db.isTransaction) this.db.exec("ROLLBACK;");
      } catch {
        // fall through to the reportable error
      }
      throw mapSqliteError(error);
    }
  }

  /**
   * Reads a persisted epoch counter from a read-only handle. A missing counter
   * is NEVER treated as zero when history may exist: absence with any history
   * rows fails closed, so old layouts cannot be silently migrated.
   */
  private static epochOf(
    db: DatabaseSync,
    key: string,
    historyTable: string,
  ): number {
    const row = db
      .prepare("SELECT value FROM store_meta WHERE key = ?")
      .get(key) as { value: string } | undefined;
    if (row !== undefined) return Number(row.value);
    const history = db
      .prepare(`SELECT COUNT(*) AS n FROM ${historyTable}`)
      .get() as { n: number | bigint };
    if (Number(history.n) > 0)
      throw new StoreError(
        "STORE_LAYOUT",
        `${historyTable} history exists but ${key} metadata is absent; refusing to treat history as zero`,
      );
    return 0;
  }

  /** Full read-only validation of a backup file before it may overwrite live bytes. */
  private static validateBackup(dbPath: string): {
    deletionEpoch: number;
    ownershipEpoch: number;
  } {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const stamped = db
        .prepare("SELECT value FROM store_meta WHERE key = 'layout_version'")
        .get() as { value: string } | undefined;
      if (stamped === undefined)
        throw new StoreError(
          "STORE_LAYOUT",
          "backup is not a stamped store (no layout_version); refusing to restore",
        );
      Store.validateStamped(db, stamped.value);
      return {
        deletionEpoch: Store.epochOf(db, "deletion_epoch", "deletions"),
        ownershipEpoch: Store.epochOf(
          db,
          "ownership_epoch",
          "workspace_ownership",
        ),
      };
    } finally {
      db.close();
    }
  }

  /** Highest deletion epoch recorded in a (backup) database file. */
  static deletionEpochOf(dbPath: string): number {
    return Store.validateBackup(dbPath).deletionEpoch;
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

  /** Highest deletion epoch recorded in this store's live database. */
  deletionEpoch(): number {
    this.assertOpen();
    return Store.epochOf(this.db, "deletion_epoch", "deletions");
  }

  /** Live ownership epoch (same fail-closed rule as the deletion epoch). */
  ownershipEpoch(): number {
    this.assertOpen();
    return Store.epochOf(this.db, "ownership_epoch", "workspace_ownership");
  }

  /**
   * Restores a backup with full safety ordering: the backup's layout and epoch
   * metadata are validated read-only BEFORE any live byte is touched, so an
   * invalid or future-layout backup preserves acknowledged live records. A
   * restore never rolls back workspace ownership: a snapshot older than the
   * live ownership epoch would resurrect a stale owner or permit epoch reuse,
   * so it is refused.
   */
  restore(backupPath: string): void {
    this.assertOpen();
    let backup: { deletionEpoch: number; ownershipEpoch: number };
    try {
      backup = Store.validateBackup(backupPath);
    } catch (error) {
      throw error instanceof StoreError ? error : mapSqliteError(error);
    }
    const liveDeletionEpoch = this.deletionEpoch();
    if (backup.deletionEpoch < liveDeletionEpoch)
      throw new StoreError(
        "STALE_RESTORE",
        `backup deletion epoch ${String(backup.deletionEpoch)} is older than current ${String(liveDeletionEpoch)}`,
      );
    const liveOwnershipEpoch = this.ownershipEpoch();
    if (backup.ownershipEpoch < liveOwnershipEpoch)
      throw new StoreError(
        "STALE_OWNERSHIP",
        `backup ownership epoch ${String(backup.ownershipEpoch)} is older than current ${String(liveOwnershipEpoch)}; restoring would roll back the workspace writer state`,
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

  /**
   * Durable canonical-workspace ownership: at most one live writer per
   * workspace, keyed by canonical workspace id rather than session. The write
   * is a compare-and-set serialized by `BEGIN IMMEDIATE` and persisted in the
   * same authoritative store as the receipts.
   */
  acquireWorkspace(workspaceId: string, sessionId: string): WorkspaceOwnership {
    this.assertWritable();
    try {
      this.db.exec("BEGIN IMMEDIATE;");
      const row = this.db
        .prepare(
          "SELECT owner_session_id, epoch FROM workspace_ownership WHERE workspace_id = ?",
        )
        .get(workspaceId) as
        { owner_session_id: string; epoch: number | bigint } | undefined;
      let ownership: WorkspaceOwnership;
      if (row === undefined) {
        // Epochs never repeat: the counter is globally monotonic in store_meta,
        // so a released workspace is re-acquired at a strictly higher epoch.
        const epoch = this.metaGet("ownership_epoch") + 1;
        this.db
          .prepare(
            "INSERT INTO workspace_ownership (workspace_id, owner_session_id, epoch, acquired_at, renewed_at) " +
              "VALUES (?, ?, ?, ?, ?)",
          )
          .run(
            workspaceId,
            sessionId,
            epoch,
            new Date().toISOString(),
            new Date().toISOString(),
          );
        this.db
          .prepare(
            "INSERT INTO store_meta (key, value) VALUES ('ownership_epoch', ?) " +
              "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          )
          .run(String(epoch));
        ownership = { workspaceId, ownerSessionId: sessionId, epoch };
      } else if (row.owner_session_id === sessionId) {
        ownership = {
          workspaceId,
          ownerSessionId: sessionId,
          epoch: Number(row.epoch),
        };
      } else {
        throw new StoreError(
          "OWNERSHIP_CONFLICT",
          `workspace ${workspaceId} is owned by session ${row.owner_session_id}`,
        );
      }
      this.db.exec("COMMIT;");
      return ownership;
    } catch (error) {
      try {
        if (this.db.isTransaction) this.db.exec("ROLLBACK;");
      } catch {
        // fall through to the reportable error
      }
      throw mapSqliteError(error);
    }
  }

  /**
   * Compare-and-set renewal: the epoch advances only when the caller is the
   * current owner presenting the current epoch; anything else is refused.
   */
  renewWorkspace(
    workspaceId: string,
    sessionId: string,
    expectedEpoch: number,
  ): WorkspaceOwnership {
    this.assertWritable();
    try {
      this.db.exec("BEGIN IMMEDIATE;");
      const row = this.db
        .prepare(
          "SELECT owner_session_id, epoch FROM workspace_ownership WHERE workspace_id = ?",
        )
        .get(workspaceId) as
        { owner_session_id: string; epoch: number | bigint } | undefined;
      if (row === undefined)
        throw new StoreError(
          "OWNERSHIP_NOT_FOUND",
          `workspace ${workspaceId} is not owned`,
        );
      if (row.owner_session_id !== sessionId)
        throw new StoreError(
          "OWNERSHIP_CONFLICT",
          `workspace ${workspaceId} is owned by session ${row.owner_session_id}`,
        );
      if (Number(row.epoch) !== expectedEpoch)
        throw new StoreError(
          "OWNERSHIP_STALE_EPOCH",
          `workspace ${workspaceId} is at epoch ${String(row.epoch)}, caller presented ${String(expectedEpoch)}`,
        );
      // Renewals allocate from the global epoch too: the next epoch is never
      // lower than the global counter, so a stale epoch can never revalidate
      // after releases/renewals of other workspaces.
      const epoch =
        Math.max(this.metaGet("ownership_epoch"), Number(row.epoch)) + 1;
      this.db
        .prepare(
          "UPDATE workspace_ownership SET epoch = ?, renewed_at = ? WHERE workspace_id = ?",
        )
        .run(epoch, new Date().toISOString(), workspaceId);
      this.db
        .prepare(
          "INSERT INTO store_meta (key, value) VALUES ('ownership_epoch', ?) " +
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(String(epoch));
      this.db.exec("COMMIT;");
      return { workspaceId, ownerSessionId: sessionId, epoch };
    } catch (error) {
      try {
        if (this.db.isTransaction) this.db.exec("ROLLBACK;");
      } catch {
        // fall through to the reportable error
      }
      throw mapSqliteError(error);
    }
  }

  /** Releases ownership; only the current owner with the current epoch succeeds. */
  releaseWorkspace(
    workspaceId: string,
    sessionId: string,
    expectedEpoch: number,
  ): void {
    this.assertOpen();
    try {
      this.db.exec("BEGIN IMMEDIATE;");
      const row = this.db
        .prepare(
          "SELECT owner_session_id, epoch FROM workspace_ownership WHERE workspace_id = ?",
        )
        .get(workspaceId) as
        { owner_session_id: string; epoch: number | bigint } | undefined;
      if (row === undefined)
        throw new StoreError(
          "OWNERSHIP_NOT_FOUND",
          `workspace ${workspaceId} is not owned`,
        );
      if (row.owner_session_id !== sessionId)
        throw new StoreError(
          "OWNERSHIP_CONFLICT",
          `workspace ${workspaceId} is owned by session ${row.owner_session_id}`,
        );
      if (Number(row.epoch) !== expectedEpoch)
        throw new StoreError(
          "OWNERSHIP_STALE_EPOCH",
          `workspace ${workspaceId} is at epoch ${String(row.epoch)}, caller presented ${String(expectedEpoch)}`,
        );
      this.db
        .prepare("DELETE FROM workspace_ownership WHERE workspace_id = ?")
        .run(workspaceId);
      this.db.exec("COMMIT;");
    } catch (error) {
      try {
        if (this.db.isTransaction) this.db.exec("ROLLBACK;");
      } catch {
        // fall through to the reportable error
      }
      throw mapSqliteError(error);
    }
  }

  /** Current ownership row for a workspace, or undefined when unowned. */
  workspaceOwner(workspaceId: string): WorkspaceOwnership | undefined {
    this.assertOpen();
    const row = this.db
      .prepare(
        "SELECT owner_session_id, epoch FROM workspace_ownership WHERE workspace_id = ?",
      )
      .get(workspaceId) as
      { owner_session_id: string; epoch: number | bigint } | undefined;
    if (row === undefined) return undefined;
    return {
      workspaceId,
      ownerSessionId: row.owner_session_id,
      epoch: Number(row.epoch),
    };
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
    this.assertWritable();
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
