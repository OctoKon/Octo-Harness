// TD-25: internal Store-side recovery. Native callers supply the existing target
// session and reference authority; this never dispatches or opens admission.
import {
  ACTION_STATES,
  CONTRACT_VERSION,
  ContractError,
  EFFECT_STATES,
  RUN_STATES,
  TRANSPORT_LIMITS,
  validateRecord,
  type RecordByKind,
} from "./contracts.js";
import {
  reconcile,
  type RecoveryReport,
  type WriterStatus,
} from "./recovery.js";
import type {
  AppendInput,
  CallerContext,
  Store,
  StoredRecord,
} from "./store.js";

export class RecoveryApplyError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RecoveryApplyError";
    this.code = code;
  }
}

export interface RecoveryApplyInput {
  readonly scopeId: string;
  /** Native recovery context for the persisted target session. Stored profile fields stay historical. */
  readonly caller: CallerContext;
  readonly explicitRestart: boolean;
  /** Native-observed writer status; this module cannot establish OS liveness. */
  readonly writers: readonly WriterStatus[];
}

export interface RecoveryApplyResult {
  /** Per-session only; native callers must union workspace sessions and enforce writer fences before takeover. */
  readonly report: RecoveryReport;
  readonly applied: {
    readonly actionIds: readonly string[];
    readonly runIds: readonly string[];
  };
  readonly seqs: readonly number[];
}

const fail = (code: string, message: string): never => {
  throw new RecoveryApplyError(code, message);
};
const id = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

function snapshot(store: Store, scopeId: string, sessionId: string) {
  const stamp = () =>
    JSON.stringify([
      store.cursor(scopeId),
      store.deletionEpoch(),
      store.ownershipEpoch(),
      store.configRevision(scopeId),
    ]);
  const before = stamp();
  const scope = store.list(scopeId);
  const target = store.list(scopeId, 0, sessionId);
  if (before !== stamp())
    fail("RECOVERY_STALE_SNAPSHOT", "Journal changed during recovery read");
  if (scope.skippedUnknownSchema || target.skippedUnknownSchema)
    fail("RECOVERY_UNKNOWN_SCHEMA", "Recovery cannot skip unknown records");
  const attributed = new Set(
    target.records.map(({ record }) => record.recordId),
  );
  if (
    scope.records.some(
      ({ kind, record }) =>
        kind === "run" &&
        record.piSessionId === sessionId &&
        !attributed.has(record.recordId),
    )
  )
    fail(
      "RECOVERY_SCOPE",
      "Target run has inconsistent journal session attribution",
    );
  return {
    records: target.records,
    identity: JSON.stringify([before, scope.records, target.records]),
  };
}

function journal(
  records: readonly StoredRecord[],
  scopeId: string,
  sessionId: string,
) {
  const runs = new Map<string, RecordByKind["run"]>();
  const actions = new Map<string, RecordByKind["action"]>();
  const outcomes = new Map<string, RecordByKind["outcome"]>();
  for (const { kind, record } of records) {
    if (kind !== "run" && kind !== "action" && kind !== "outcome") continue;
    if (
      record.schemaVersion !== CONTRACT_VERSION ||
      record.scopeId !== scopeId ||
      !id(record.recordId) ||
      !Array.isArray(record.sourceIds) ||
      !record.sourceIds.every(id)
    )
      fail("RECOVERY_INVALID_JOURNAL", "Invalid recovery source metadata");
    if (kind === "run") {
      const run = record as RecordByKind["run"];
      if (
        !id(run.runId) ||
        run.piSessionId !== sessionId ||
        !RUN_STATES.includes(run.state)
      )
        fail(
          "RECOVERY_INVALID_JOURNAL",
          "Run is not bound to the target session",
        );
      runs.set(run.runId, run);
    } else if (kind === "action") {
      const action = record as RecordByKind["action"];
      if (
        !id(action.actionId) ||
        !id(action.runId) ||
        !ACTION_STATES.includes(action.state)
      )
        fail("RECOVERY_INVALID_JOURNAL", "Invalid action recovery state");
      actions.set(action.actionId, action);
    } else {
      const outcome = record as RecordByKind["outcome"];
      if (!id(outcome.actionId) || !EFFECT_STATES.includes(outcome.effectState))
        fail("RECOVERY_INVALID_JOURNAL", "Invalid observed outcome");
      outcomes.set(outcome.actionId, outcome);
    }
  }
  for (const action of actions.values())
    if (!runs.has(action.runId))
      fail("RECOVERY_INVALID_JOURNAL", "Action has no target-session run");
  for (const outcome of outcomes.values())
    if (!actions.has(outcome.actionId))
      fail("RECOVERY_INVALID_JOURNAL", "Outcome has no target-session action");
  return { runs, actions, outcomes };
}

/**
 * Append correction versions atomically. Reference callbacks run before the
 * write transaction; only a captured pure lookup reaches Store.append. A fresh
 * in-transaction snapshot must still equal the authorized journal snapshot.
 * All record writes and validation stay in Store; only transaction control uses
 * its same-package internal handle. No result acknowledges an uncommitted seq.
 */
export function applyRecovery(
  store: Store,
  input: RecoveryApplyInput,
): RecoveryApplyResult {
  const scopeId = input.scopeId;
  const caller: CallerContext = {
    sessionId: input.caller.sessionId,
    configRevision: input.caller.configRevision,
    profileRevision: input.caller.profileRevision,
    policyRevision: input.caller.policyRevision,
  };
  const authorize = input.caller.resolveReference;
  if (input.explicitRestart !== true)
    fail(
      "RECOVERY_RESTART_REQUIRED",
      "Recovery requires an explicit engine Restart",
    );
  if (!id(scopeId) || !id(caller.sessionId))
    fail(
      "RECOVERY_SCOPE",
      "Recovery requires a native target scope and session",
    );
  const handle = store.db;
  if (handle.isTransaction)
    fail(
      "RECOVERY_TRANSACTION_ACTIVE",
      "Recovery cannot own an existing transaction",
    );
  store.appendBatch([], caller); // Also rejects closed/read-only stores with no corrections.
  if (store.configRevision(scopeId) !== caller.configRevision)
    fail("RECOVERY_SCOPE", "Recovery configuration revision is stale");
  const writers = input.writers.map(({ lease, alive }): WriterStatus => {
    if (
      lease.piSessionId !== caller.sessionId ||
      !id(lease.writerId) ||
      !id(lease.leaseEpoch) ||
      (alive !== true && alive !== false && alive !== "unknown")
    )
      fail(
        "RECOVERY_SCOPE",
        "Writer witness is not bound to the target session",
      );
    return {
      lease: {
        piSessionId: lease.piSessionId,
        writerId: lease.writerId,
        leaseEpoch: lease.leaseEpoch,
      },
      alive,
    };
  });
  const initial = snapshot(store, scopeId, caller.sessionId);
  const current = journal(initial.records, scopeId, caller.sessionId);
  const report = reconcile({
    runs: [...current.runs.values()],
    actions: [...current.actions.values()],
    outcomes: [...current.outcomes.values()],
    writers,
    explicitRestart: true,
  });
  const writes: AppendInput[] = [];
  const createdAt = new Date().toISOString();
  const correction = (
    source: RecordByKind["run"] | RecordByKind["action"],
    state: string,
    proof: readonly string[],
  ) => ({
    ...source,
    recordId: `recovery:${globalThis.crypto.randomUUID()}`,
    createdAt,
    sourceIds: [...new Set([...source.sourceIds, source.recordId, ...proof])],
    state,
  });
  for (const change of report.actionCorrections) {
    const action = current.actions.get(change.actionId)!;
    const observed = current.outcomes.get(action.actionId);
    writes.push({
      kind: "action",
      record: correction(
        action,
        change.to,
        observed ? [observed.recordId] : [],
      ),
    });
  }
  for (const change of report.runCorrections) {
    const run = current.runs.get(change.runId)!;
    const proof = [...current.actions.values()]
      .filter((action) => action.runId === run.runId)
      .map((action) => action.recordId);
    writes.push({ kind: "run", record: correction(run, change.to, proof) });
  }

  const authorized = new Set<string>();
  for (const write of writes) {
    // The native schema includes body references as well as sourceIds.
    try {
      validateRecord(write.kind, write.record, {
        ...caller,
        scopeId,
        lastDurableSeq: store.cursor(),
        maxInlineBytes: TRANSPORT_LIMITS.maxInlineBytes,
        resolveReference: (ref, scope) => {
          if (
            scope !== scopeId ||
            (!authorized.has(ref) && authorize?.(ref, scope) !== true)
          )
            fail(
              "RECOVERY_REFERENCE_DENIED",
              "Native reference authority denied recovery",
            );
          authorized.add(ref);
          return true;
        },
      });
    } catch (error) {
      if (
        error instanceof ContractError &&
        error.code === "UNRESOLVED_REFERENCE"
      )
        throw new RecoveryApplyError(
          "RECOVERY_REFERENCE_DENIED",
          "Native reference authority denied recovery",
          { cause: error },
        );
      throw error;
    }
  }
  if (store.db !== handle)
    fail(
      "RECOVERY_STALE_SNAPSHOT",
      "Store changed during reference authorization",
    );
  if (handle.isTransaction)
    fail(
      "RECOVERY_TRANSACTION_ACTIVE",
      "Reference authorization left a transaction active",
    );
  const writeCaller: CallerContext = {
    ...caller,
    resolveReference: (ref, scope) => scope === scopeId && authorized.has(ref),
  };
  let began = false;
  let committing = false;
  try {
    handle.exec("BEGIN IMMEDIATE;");
    began = true;
    if (store.configRevision(scopeId) !== caller.configRevision)
      fail(
        "RECOVERY_SCOPE",
        "Recovery configuration revision changed before commit",
      );
    const locked = snapshot(store, scopeId, caller.sessionId);
    if (locked.identity !== initial.identity)
      fail(
        "RECOVERY_STALE_SNAPSHOT",
        "Journal changed before correction commit",
      );
    const fresh = journal(locked.records, scopeId, caller.sessionId);
    const committedReport = reconcile({
      runs: [...fresh.runs.values()],
      actions: [...fresh.actions.values()],
      outcomes: [...fresh.outcomes.values()],
      writers,
      explicitRestart: true,
    });
    if (JSON.stringify(committedReport) !== JSON.stringify(report))
      fail(
        "RECOVERY_STALE_SNAPSHOT",
        "Recovery pre-states changed before commit",
      );
    const seqs: number[] = [];
    for (const write of writes) seqs.push(store.append(write, writeCaller).seq);
    committing = true;
    handle.exec("COMMIT;");
    if (handle.isTransaction)
      fail("RECOVERY_COMMIT_UNCERTAIN", "Recovery commit was not acknowledged");
    return {
      report: committedReport,
      applied: {
        actionIds: committedReport.actionCorrections.map(
          (change) => change.actionId,
        ),
        runIds: committedReport.runCorrections.map((change) => change.runId),
      },
      seqs,
    };
  } catch (error) {
    if (began && handle.isTransaction) {
      try {
        handle.exec("ROLLBACK;");
      } catch (rollbackError) {
        try {
          store.close();
        } catch {
          /* The store remains unusable after an unacknowledged rollback. */
        }
        throw new RecoveryApplyError(
          "RECOVERY_ROLLBACK_FAILED",
          "Recovery rollback failed; discard this Store",
          {
            cause: new AggregateError([error, rollbackError]),
          },
        );
      }
    } else if (committing) {
      throw new RecoveryApplyError(
        "RECOVERY_COMMIT_UNCERTAIN",
        "Recovery commit was not acknowledged",
        { cause: error },
      );
    }
    throw error;
  }
}
