import type {
  EventKind,
  EventPayloads,
  SplyceErrorPayload,
  SplyceEventEnvelope,
} from "@splyce/pi/contracts";

export type ApprovalState = "requested" | "allowed" | "denied" | "canceled";

export interface ApprovalView {
  approvalRequestId: string;
  runId: string;
  actionId: string;
  capabilityId: string;
  targetScope: string;
  normalizedTarget: string;
  riskRationale: string;
  timeoutMs?: number;
  state: ApprovalState;
}

export type ToolCallStatus =
  "pending" | "success" | "error" | "uncertain" | "canceled";

export interface ToolCallView {
  actionId: string;
  capabilityId: string;
  target: string;
  argsSummary: string;
  status: ToolCallStatus;
  outcomeRef?: string;
  error?: string;
  approval?: ApprovalView;
}

export type TurnStatus =
  | "streaming"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "canceled"
  | "stopped";

export type TurnBlock =
  | { type: "thought"; id: string; text: string }
  | { type: "text"; id: string; text: string }
  | { type: "tool"; id: string; actionId: string };

export interface TurnView {
  runId: string;
  turnId?: string;
  status: TurnStatus;
  text: string;
  thought: string;
  actions: ToolCallView[];
  blocks: TurnBlock[];
  error?: SplyceErrorPayload;
  candidateSnapshotId?: string;
  finalRevision?: string;
  cleanedUp?: boolean;
}

export interface TurnsState {
  sessionId?: string;
  currentRunId?: string;
  runs: Record<string, TurnView>;
  lastSeq: number;
  lastDurableSeq: number;
  seenEventIds: Set<string>;
  needsResync: boolean;
  resyncFromSeq?: number;
  resyncAfterSeq?: number;
  resyncCount: number;
  duplicateCount: number;
  unknownKindCount: number;
  unresolvedPayloadCount: number;
  pendingPayloadIds: string[];
  protocolErrors: number;
  stale: boolean;
}

export function createTurnsState(): TurnsState {
  return {
    runs: {},
    lastSeq: 0,
    lastDurableSeq: 0,
    seenEventIds: new Set(),
    needsResync: false,
    resyncCount: 0,
    duplicateCount: 0,
    unknownKindCount: 0,
    unresolvedPayloadCount: 0,
    pendingPayloadIds: [],
    protocolErrors: 0,
    stale: false,
  };
}

function emptyTurn(runId: string): TurnView {
  return {
    runId,
    status: "streaming",
    text: "",
    thought: "",
    actions: [],
    blocks: [],
  };
}

function withRun(state: TurnsState, runId: string): TurnsState {
  if (state.runs[runId]) return state;
  return { ...state, runs: { ...state.runs, [runId]: emptyTurn(runId) } };
}

function updateRun(
  state: TurnsState,
  runId: string,
  update: (turn: TurnView) => TurnView,
): TurnsState {
  const next = withRun(state, runId);
  const current = next.runs[runId] ?? emptyTurn(runId);
  const updated = update({
    ...current,
    actions: [...current.actions],
    blocks: [...current.blocks],
  });
  return { ...next, runs: { ...next.runs, [runId]: updated } };
}

function ensureToolBlock(turn: TurnView, actionId: string): TurnView {
  if (
    turn.blocks.some(
      (block) => block.type === "tool" && block.actionId === actionId,
    )
  )
    return turn;
  return {
    ...turn,
    blocks: [
      ...turn.blocks,
      { type: "tool", id: `tool:${actionId}`, actionId },
    ],
  };
}

function appendStreamBlock(
  turn: TurnView,
  type: "text" | "thought",
  id: string,
  delta: string,
): TurnView {
  const blocks = [...turn.blocks];
  const last = blocks[blocks.length - 1];
  if (last?.type === type)
    blocks[blocks.length - 1] = { ...last, text: last.text + delta };
  else blocks.push({ type, id, text: delta });
  return type === "text"
    ? { ...turn, text: turn.text + delta, blocks }
    : { ...turn, thought: turn.thought + delta, blocks };
}

function isTerminal(turn: TurnView): boolean {
  return (
    turn.status === "completed" ||
    turn.status === "failed" ||
    turn.status === "canceled"
  );
}

function findAction(
  state: TurnsState,
  actionId: string,
): ToolCallView | undefined {
  for (const turn of Object.values(state.runs)) {
    const action = turn.actions.find((item) => item.actionId === actionId);
    if (action) return action;
  }
  return undefined;
}

function updateAction(
  state: TurnsState,
  runId: string,
  actionId: string,
  update: (action: ToolCallView) => ToolCallView,
): TurnsState {
  return updateRun(state, runId, (turn) => {
    const index = turn.actions.findIndex((item) => item.actionId === actionId);
    if (index === -1) {
      turn.actions.push(
        update({
          actionId,
          capabilityId: "unknown",
          target: "",
          argsSummary: "",
          status: "pending",
        }),
      );
      return ensureToolBlock(turn, actionId);
    }
    const action = turn.actions[index];
    if (action) turn.actions[index] = update(action);
    return turn;
  });
}

function closeApprovals(
  turn: TurnView,
  state: "canceled" | "denied",
): TurnView {
  let changed = false;
  const actions = turn.actions.map((action) => {
    if (action.approval?.state !== "requested") return action;
    changed = true;
    return { ...action, approval: { ...action.approval, state } };
  });
  return changed ? { ...turn, actions } : turn;
}

function closePendingActions(
  turn: TurnView,
  status: "canceled" | "uncertain",
): TurnView {
  let changed = false;
  const actions = turn.actions.map((action) => {
    if (action.status !== "pending") return action;
    changed = true;
    return { ...action, status };
  });
  return changed ? { ...turn, actions } : turn;
}

function settleApprovalStatus(turn: TurnView): TurnView {
  const waiting = turn.actions.some(
    (action) => action.approval?.state === "requested",
  );
  if (!waiting && turn.status === "waiting_approval")
    return { ...turn, status: "streaming" };
  if (waiting && turn.status === "streaming")
    return { ...turn, status: "waiting_approval" };
  return turn;
}

function payloadOf<K extends EventKind>(
  envelope: SplyceEventEnvelope,
  kind: K,
): EventPayloads[K] | undefined {
  if (envelope.kind !== kind) return undefined;
  return (envelope as { payload?: EventPayloads[K] }).payload;
}

function missingPayload(state: TurnsState): TurnsState {
  return { ...state, protocolErrors: state.protocolErrors + 1 };
}

// Mirrors the subscribe cursor to the engine; TD-15 owns replay, TD-18 owns gap detection.
export function reduceTurns(
  state: TurnsState,
  envelope: SplyceEventEnvelope,
  options?: { coalesced?: boolean },
): TurnsState {
  if (
    !envelope ||
    typeof envelope.seq !== "number" ||
    typeof envelope.kind !== "string" ||
    typeof envelope.eventId !== "string"
  ) {
    return { ...state, protocolErrors: state.protocolErrors + 1 };
  }
  const isSnapshot = envelope.kind === "run.reconnect_snapshot";
  if (
    state.seenEventIds.has(envelope.eventId) ||
    (envelope.durable
      ? envelope.seq <= state.lastDurableSeq
      : envelope.seq <= state.lastSeq)
  ) {
    return { ...state, duplicateCount: state.duplicateCount + 1 };
  }

  if (state.needsResync && !isSnapshot) return state;
  if (
    !isSnapshot &&
    !options?.coalesced &&
    envelope.seq > state.lastSeq &&
    envelope.seq !== state.lastSeq + 1
  ) {
    return {
      ...state,
      needsResync: true,
      resyncFromSeq: state.lastSeq + 1,
      resyncAfterSeq: state.lastSeq,
    };
  }

  const next: TurnsState = {
    ...state,
    sessionId: envelope.sessionId,
    lastSeq: Math.max(state.lastSeq, envelope.seq),
    lastDurableSeq:
      envelope.durable && !isSnapshot
        ? Math.max(state.lastDurableSeq, envelope.seq)
        : state.lastDurableSeq,
    seenEventIds: new Set(state.seenEventIds).add(envelope.eventId),
  };

  if (!("payload" in envelope)) {
    next.unresolvedPayloadCount = state.unresolvedPayloadCount + 1;
    if (envelope.durable) {
      next.stale = true;
      next.pendingPayloadIds = [...state.pendingPayloadIds, envelope.eventId];
    }
    return next;
  }

  switch (envelope.kind) {
    case "turn.started": {
      const payload = payloadOf(envelope, "turn.started");
      if (!payload) return missingPayload(next);
      next.currentRunId = payload.runId;
      return updateRun(next, payload.runId, (turn) => ({
        ...turn,
        turnId: turn.turnId ?? payload.turnId,
      }));
    }

    case "turn.stream_delta":
    case "turn.thought_delta": {
      const payload = payloadOf(envelope, envelope.kind);
      if (!payload) return missingPayload(next);
      const { runId, delta } = payload;
      const turnId = (payload as { turnId?: string }).turnId;
      if (!next.runs[runId] || isTerminal(next.runs[runId])) {
        return missingPayload(next);
      }
      if (
        turnId &&
        next.runs[runId].turnId &&
        turnId !== next.runs[runId].turnId
      ) {
        return missingPayload(next);
      }
      const field = envelope.kind === "turn.stream_delta" ? "text" : "thought";
      return updateRun(next, runId, (turn) =>
        appendStreamBlock(turn, field, `${field}:${envelope.seq}`, delta),
      );
    }

    case "turn.tool_intent": {
      const payload = payloadOf(envelope, "turn.tool_intent");
      if (!payload) return missingPayload(next);
      const { runId, actionId, capabilityId, target, argsSummary } = payload;
      if (!next.runs[runId] || isTerminal(next.runs[runId])) {
        return missingPayload(next);
      }
      return updateRun(next, runId, (turn) => {
        const index = turn.actions.findIndex(
          (item) => item.actionId === actionId,
        );
        const previous = index === -1 ? undefined : turn.actions[index];
        const approval = previous?.approval
          ? { ...previous.approval, state: "allowed" as const }
          : undefined;
        const action: ToolCallView = {
          ...(previous ?? { actionId, status: "pending" }),
          actionId,
          capabilityId,
          target,
          argsSummary,
          ...(approval ? { approval } : {}),
        };
        if (index === -1) turn.actions.push(action);
        else turn.actions[index] = action;
        return settleApprovalStatus(ensureToolBlock(turn, actionId));
      });
    }

    case "turn.tool_outcome": {
      const payload = payloadOf(envelope, "turn.tool_outcome");
      if (!payload) return missingPayload(next);
      const { runId, actionId, status, outcomeRef, error } = payload;
      if (!next.runs[runId]) return missingPayload(next);
      return updateAction(next, runId, actionId, (action) => ({
        ...action,
        status,
        ...(outcomeRef !== undefined ? { outcomeRef } : {}),
        ...(error !== undefined ? { error } : {}),
      }));
    }

    case "turn.completed": {
      const payload = payloadOf(envelope, "turn.completed");
      if (!payload) return missingPayload(next);
      const { runId, candidateSnapshotId, finalRevision } = payload;
      if (!next.runs[runId]) return missingPayload(next);
      return updateRun(next, runId, (turn) => ({
        ...closeApprovals(turn, "canceled"),
        status: "completed",
        candidateSnapshotId,
        finalRevision,
      }));
    }

    case "turn.failed": {
      const payload = payloadOf(envelope, "turn.failed");
      if (!payload) return missingPayload(next);
      const { runId, error } = payload;
      if (!next.runs[runId]) return missingPayload(next);
      return updateRun(next, runId, (turn) => ({
        ...closeApprovals(closePendingActions(turn, "uncertain"), "denied"),
        status: "failed",
        error,
      }));
    }

    case "turn.canceled": {
      const payload = payloadOf(envelope, "turn.canceled");
      if (!payload) return missingPayload(next);
      const { runId, cleanedUp } = payload;
      if (!next.runs[runId]) return missingPayload(next);
      return updateRun(next, runId, (turn) => ({
        ...closeApprovals(closePendingActions(turn, "canceled"), "canceled"),
        status: "canceled",
        cleanedUp,
      }));
    }

    case "approval.requested": {
      const event = payloadOf(envelope, "approval.requested");
      if (!event) return missingPayload(next);
      const requestRun = next.runs[event.runId];
      if (!requestRun || isTerminal(requestRun)) {
        return missingPayload(next);
      }
      return updateRun(next, event.runId, (turn) => {
        const index = turn.actions.findIndex(
          (item) => item.actionId === event.actionId,
        );
        const previous: ToolCallView | undefined =
          index === -1 ? undefined : turn.actions[index];
        const approval: ApprovalView = {
          approvalRequestId: event.approvalRequestId,
          runId: event.runId,
          actionId: event.actionId,
          capabilityId: event.capabilityId,
          targetScope: event.targetScope,
          normalizedTarget: event.normalizedTarget,
          riskRationale: event.riskRationale,
          ...(event.timeoutMs !== undefined
            ? { timeoutMs: event.timeoutMs }
            : {}),
          state: "requested",
        };
        const action: ToolCallView = {
          ...(previous ?? {
            actionId: event.actionId,
            capabilityId: event.capabilityId,
            target: event.normalizedTarget,
            argsSummary: "",
            status: "pending",
          }),
          approval,
        };
        if (index === -1) turn.actions.push(action);
        else turn.actions[index] = action;
        return settleApprovalStatus(ensureToolBlock(turn, event.actionId));
      });
    }

    case "run.reconnect_snapshot": {
      const payload = payloadOf(envelope, "run.reconnect_snapshot");
      if (!payload) return missingPayload(next);
      const { runId, lastDurableSeq, turnId, state: snapshotState } = payload;
      next.resyncCount = state.needsResync
        ? state.resyncCount + 1
        : state.resyncCount;
      next.needsResync = false;
      delete next.resyncFromSeq;
      delete next.resyncAfterSeq;
      next.lastDurableSeq = Math.max(state.lastDurableSeq, lastDurableSeq);
      next.lastSeq = Math.max(next.lastSeq, lastDurableSeq);
      const status: TurnStatus =
        snapshotState === "waiting_approval"
          ? "waiting_approval"
          : snapshotState === "stopped"
            ? "stopped"
            : "streaming";
      return updateRun(next, runId, (turn) => {
        const nextTurnId = turn.turnId ?? turnId;
        return {
          ...turn,
          ...(nextTurnId ? { turnId: nextTurnId } : {}),
          status:
            turn.status === "completed" || turn.status === "failed"
              ? turn.status
              : status,
        };
      });
    }

    case "stream.resync": {
      const payload = payloadOf(envelope, "stream.resync");
      if (!payload) return missingPayload(next);
      next.needsResync = true;
      next.resyncFromSeq = payload.fromSeq;
      next.resyncAfterSeq = payload.fromSeq;
      return next;
    }

    case "engine.status": {
      const payload = payloadOf(envelope, "engine.status");
      if (!payload) return missingPayload(next);
      next.stale = payload.state === "stopped";
      return next;
    }

    case "session.tree_updated":
      return next;

    default:
      return { ...next, unknownKindCount: next.unknownKindCount + 1 };
  }
}

export function resyncRequest(state: TurnsState): { afterSeq: number } | null {
  if (!state.needsResync) return null;
  return { afterSeq: state.resyncAfterSeq ?? state.lastDurableSeq };
}

export function approvalRequestIdFor(
  state: TurnsState,
  actionId: string,
): string | undefined {
  return findAction(state, actionId)?.approval?.approvalRequestId;
}

export function canRespondToApproval(
  state: TurnsState,
  actionId: string,
): boolean {
  if (state.needsResync) return false;
  return findAction(state, actionId)?.approval?.state === "requested";
}

// TD-15 frozen limits (UNMEASURED proposal): renderer leg is 256 frames / 4 MiB;
// durable delivery pauses on 1024 frames / 8 MiB. fromSeq is cursor-exclusive.
export const TRANSPORT_LIMITS = {
  maxInlineBytes: 65536,
  maxEncodedFrameBytes: 262144,
  maxPayloadBytes: 262140,
  pendingQueueFrames: 1024,
  pendingQueueBytes: 8388608,
  rendererQueueFrames: 256,
  rendererQueueBytes: 4194304,
  transientCoalesceWindowMs: 16,
} as const;

export type TurnStreamErrorCode =
  "ERR_STREAM_RENDER_OVERFLOW" | "ERR_FRAME_TOO_LARGE";

interface PendingFrame {
  event: SplyceEventEnvelope;
  coalesced: boolean;
}

export interface TurnStreamTransportOptions {
  state?: TurnsState;
  schedule?: (task: () => void) => void;
  onState?: (state: TurnsState) => void;
  onResync?: (fromSeq: number) => void;
  onError?: (code: TurnStreamErrorCode) => void;
}

export interface TurnStreamTransport {
  enqueue(event: SplyceEventEnvelope): void;
  flush(): TurnsState;
  current(): TurnsState;
  dispose(): void;
}

const frameEncoder = new TextEncoder();

function isTransientKind(kind: EventKind): boolean {
  return kind === "turn.stream_delta" || kind === "turn.thought_delta";
}

function frameBytes(event: SplyceEventEnvelope): number {
  return 4 + frameEncoder.encode(JSON.stringify(event)).length;
}

/**
 * Bounded renderer intake. Transient deltas are coalesced in place before the
 * queue is measured, so rapid text/thought streams cost one frame per kind per
 * batch. Any overflow requests exactly one resync from the durable cursor.
 */
export function createTurnStreamTransport(
  options: TurnStreamTransportOptions = {},
): TurnStreamTransport {
  let state = options.state ?? createTurnsState();
  let pending: PendingFrame[] = [];
  let durableFrames = 0;
  let durableBytes = 0;
  let transientFrames = 0;
  let transientBytes = 0;
  let scheduled = false;
  let disposed = false;
  let resyncNotified = false;

  const schedule =
    options.schedule ??
    ((task: () => void) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(task);
      } else {
        queueMicrotask(task);
      }
    });

  function emit() {
    options.onState?.(state);
  }

  function notifyResync() {
    if (!state.needsResync || resyncNotified) return;
    resyncNotified = true;
    options.onResync?.(state.lastDurableSeq);
  }

  function resetQueue() {
    pending = [];
    durableFrames = 0;
    durableBytes = 0;
    transientFrames = 0;
    transientBytes = 0;
  }

  function overflow(code: TurnStreamErrorCode) {
    options.onError?.(code);
    if (state.needsResync) return;
    resetQueue();
    state = {
      ...state,
      needsResync: true,
      resyncFromSeq: state.lastDurableSeq,
      resyncAfterSeq: state.lastDurableSeq,
    };
    notifyResync();
    emit();
  }

  function scheduleFlush() {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      if (!disposed) flush();
    });
  }

  function canMerge(
    previous: SplyceEventEnvelope,
    event: SplyceEventEnvelope,
  ): boolean {
    if (!isTransientKind(event.kind) || previous.kind !== event.kind) {
      return false;
    }
    if (!("payload" in previous) || !("payload" in event)) return false;
    const previousPayload = previous.payload as { runId?: string };
    const eventPayload = event.payload as { runId?: string };
    return previousPayload.runId === eventPayload.runId;
  }

  function mergedEvent(
    previous: SplyceEventEnvelope,
    event: SplyceEventEnvelope,
  ): SplyceEventEnvelope {
    if (
      !("payload" in previous) ||
      !("payload" in event) ||
      previous.kind !== event.kind
    ) {
      return event;
    }
    if (
      event.kind !== "turn.stream_delta" &&
      event.kind !== "turn.thought_delta"
    ) {
      return event;
    }
    const { payload: _payload, payloadArtifactId: _artifact, ...base } = event;
    const eventPayload = event.payload as { delta: string };
    return {
      ...base,
      payload: {
        ...eventPayload,
        delta:
          (previous.payload as { delta: string }).delta + eventPayload.delta,
      },
    } as SplyceEventEnvelope;
  }

  function enqueue(event: SplyceEventEnvelope) {
    if (disposed) return;
    if (state.needsResync && event.kind !== "run.reconnect_snapshot") return;

    const bytes = frameBytes(event);
    if (bytes > TRANSPORT_LIMITS.maxEncodedFrameBytes) {
      overflow("ERR_FRAME_TOO_LARGE");
      return;
    }

    const transient = isTransientKind(event.kind);
    const previous = pending[pending.length - 1];
    if (transient && previous && canMerge(previous.event, event)) {
      const merged = mergedEvent(previous.event, event);
      const mergedBytes = frameBytes(merged);
      transientBytes += mergedBytes - frameBytes(previous.event);
      previous.event = merged;
      previous.coalesced = true;
    } else {
      pending.push({ event, coalesced: false });
      if (transient) {
        transientFrames += 1;
        transientBytes += bytes;
      } else {
        durableFrames += 1;
        durableBytes += bytes;
      }
    }

    if (
      transientFrames > TRANSPORT_LIMITS.rendererQueueFrames ||
      transientBytes > TRANSPORT_LIMITS.rendererQueueBytes ||
      durableFrames > TRANSPORT_LIMITS.pendingQueueFrames ||
      durableBytes > TRANSPORT_LIMITS.pendingQueueBytes
    ) {
      overflow("ERR_STREAM_RENDER_OVERFLOW");
      return;
    }

    scheduleFlush();
  }

  function flush(): TurnsState {
    scheduled = false;
    if (!pending.length) return state;

    const batch = pending;
    resetQueue();
    const hadResync = state.needsResync;
    for (const frame of batch) {
      state = reduceTurns(
        state,
        frame.event,
        frame.coalesced ? { coalesced: true } : undefined,
      );
    }
    if (state.needsResync && !hadResync) notifyResync();
    if (!state.needsResync) resyncNotified = false;
    emit();
    return state;
  }

  return {
    enqueue,
    flush,
    current: () => state,
    dispose() {
      disposed = true;
      resetQueue();
      scheduled = false;
    },
  };
}
