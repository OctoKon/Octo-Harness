import { describe, expect, it } from "vitest";
import type {
  EventKind,
  EventPayloads,
  SplyceEventEnvelope,
} from "@splyce/pi/contracts";
import {
  approvalRequestIdFor,
  canRespondToApproval,
  createTurnsState,
  reduceTurns,
  resyncRequest,
  type TurnsState,
} from "./turns.ts";

function event<K extends EventKind>(
  seq: number,
  kind: K,
  payload: EventPayloads[K],
  durable = kind !== "turn.stream_delta" && kind !== "turn.thought_delta",
): SplyceEventEnvelope {
  return {
    schemaVersion: 1,
    protocolVersion: 1,
    recordId: `rec_${seq}`,
    eventId: `evt_${seq}`,
    createdAt: "2026-10-26T00:00:00.000Z",
    sourceIds: [],
    scopeId: "scope_spec",
    sessionId: "ses_spec",
    seq,
    durable,
    kind,
    payload,
  } as unknown as SplyceEventEnvelope;
}

function applyAll(
  state: TurnsState,
  envelopes: SplyceEventEnvelope[],
): TurnsState {
  return envelopes.reduce(reduceTurns, state);
}

const started = (runId = "run_a", turnId = "turn_a"): SplyceEventEnvelope =>
  event(1, "turn.started", { runId, turnId });

function delta(
  seq: number,
  text: string,
  runId = "run_a",
  turnId = "turn_a",
): SplyceEventEnvelope {
  return event(
    seq,
    "turn.stream_delta",
    { runId, delta: text, turnId } as EventPayloads["turn.stream_delta"],
    false,
  );
}

const completed = (seq: number, runId = "run_a"): SplyceEventEnvelope =>
  event(seq, "turn.completed", {
    runId,
    candidateSnapshotId: "snap_clean",
    finalRevision: "rev_1",
  });

const toolIntent = (seq: number, actionId = "act_1"): SplyceEventEnvelope =>
  event(seq, "turn.tool_intent", {
    runId: "run_a",
    actionId,
    capabilityId: "fs.read_tree",
    target: "apps/desktop/src",
    argsSummary: "depth: 2",
  });

const snapshot = (
  seq: number,
  state: "ready" | "busy" | "waiting_approval" | "stopped" = "busy",
): SplyceEventEnvelope =>
  event(seq, "run.reconnect_snapshot", {
    runId: "run_a",
    lastDurableSeq: seq - 1,
    turnId: "turn_a",
    activeActionIds: [],
    state,
  });

function runW4Scenario(): SplyceEventEnvelope[] {
  return [
    started("run_w4_01", "turn_01"),
    event(
      2,
      "turn.thought_delta",
      {
        runId: "run_w4_01",
        delta: "Analyzing directory layout and package dependencies.",
        turnId: "turn_01",
      } as EventPayloads["turn.thought_delta"],
      false,
    ),
    delta(
      3,
      "I will inspect the local repository structure.\n\n",
      "run_w4_01",
      "turn_01",
    ),
    event(4, "turn.tool_intent", {
      runId: "run_w4_01",
      actionId: "act_w4_scan",
      capabilityId: "fs.read_tree",
      target: "apps/desktop/src",
      argsSummary: "depth: 2, filter: '*.svelte'",
    }),
    event(5, "turn.tool_outcome", {
      runId: "run_w4_01",
      actionId: "act_w4_scan",
      status: "success",
      outcomeRef: "ref_fs_tree_result",
    }),
    delta(
      6,
      "Scan completed successfully. Found 14 Svelte components.",
      "run_w4_01",
      "turn_01",
    ),
    event(7, "turn.completed", {
      runId: "run_w4_01",
      candidateSnapshotId: "snap_w4_clean",
      finalRevision: "rev_w4_01",
    }),
  ];
}

describe("FUI-W4 stream & backpressure semantics", () => {
  it("reconstructs the exact interleaved text, card and terminal state", () => {
    const state = applyAll(createTurnsState(), runW4Scenario());
    const run = state.runs.run_w4_01;

    expect(run).toBeDefined();
    expect(run.status).toBe("completed");
    expect(run.text).toBe(
      "I will inspect the local repository structure.\n\nScan completed successfully. Found 14 Svelte components.",
    );
    expect(run.thought).toBe(
      "Analyzing directory layout and package dependencies.",
    );
    expect(run.actions).toHaveLength(1);
    expect(run.actions[0]).toMatchObject({
      actionId: "act_w4_scan",
      capabilityId: "fs.read_tree",
      status: "success",
      outcomeRef: "ref_fs_tree_result",
    });
    expect(run.blocks.map((block) => block.type)).toEqual([
      "thought",
      "text",
      "tool",
      "text",
    ]);
    expect(run.blocks[0]).toMatchObject({
      type: "thought",
      text: "Analyzing directory layout and package dependencies.",
    });
    expect(run.blocks[1]).toMatchObject({
      type: "text",
      text: "I will inspect the local repository structure.\n\n",
    });
    expect(run.blocks[2]).toMatchObject({
      type: "tool",
      actionId: "act_w4_scan",
    });
    expect(run.blocks[3]).toMatchObject({
      type: "text",
      text: "Scan completed successfully. Found 14 Svelte components.",
    });
    expect(state.lastDurableSeq).toBe(7);
    expect(state.needsResync).toBe(false);
    expect(state).toMatchObject({
      resyncCount: 0,
      duplicateCount: 0,
      unknownKindCount: 0,
      protocolErrors: 0,
    });
  });

  it("keeps a 10x render-rate burst lossless and requests no resync", () => {
    const burst = Array.from({ length: 10_000 }, (_, index) =>
      delta(index + 2, "x"),
    );
    const state = applyAll(createTurnsState(), [
      started(),
      ...burst,
      completed(10_002),
    ]);

    expect(state.runs.run_a.text).toHaveLength(10_000);
    expect(state.runs.run_a.text).toBe("x".repeat(10_000));
    expect(state.runs.run_a.status).toBe("completed");
    expect(state.lastSeq).toBe(10_002);
    expect(state.needsResync).toBe(false);
    expect(state.resyncCount).toBe(0);
  });
});

describe("FUI-W5 approval race semantics", () => {
  it("closes a stale approval on cancel and refuses a late response", () => {
    const state = applyAll(createTurnsState(), [
      started("run_w5_race", "turn_01"),
      event(2, "approval.requested", {
        approvalRequestId: "apr_w5_exec",
        runId: "run_w5_race",
        actionId: "act_w5_exec",
        capabilityId: "shell.execute",
        targetScope: "scope_spec",
        normalizedTarget: "F:/test/Splyce/scripts/deploy.sh",
        riskRationale: "Deploy script execution.",
        timeoutMs: 15000,
      }),
      event(3, "turn.canceled", { runId: "run_w5_race", cleanedUp: true }),
    ]);
    const run = state.runs.run_w5_race;

    expect(run.status).toBe("canceled");
    expect(run.actions).toHaveLength(1);
    expect(run.actions[0].approval?.state).toBe("canceled");
    expect(run.actions[0].status).toBe("canceled");
    expect(canRespondToApproval(state, "act_w5_exec")).toBe(false);
    expect(approvalRequestIdFor(state, "act_w5_exec")).toBe("apr_w5_exec");
    expect(run.actions[0].outcomeRef).toBeUndefined();
  });

  it("exposes the approval request id and settles to streaming after intent", () => {
    const state = applyAll(createTurnsState(), [
      started(),
      event(2, "approval.requested", {
        approvalRequestId: "apr_1",
        runId: "run_a",
        actionId: "act_1",
        capabilityId: "shell.execute",
        targetScope: "scope_spec",
        normalizedTarget: "F:/test/Splyce/scripts/deploy.sh",
        riskRationale: "Deploy script execution.",
      }),
      event(3, "turn.tool_intent", {
        runId: "run_a",
        actionId: "act_1",
        capabilityId: "shell.execute",
        target: "scripts/deploy.sh",
        argsSummary: "./deploy.sh",
      }),
    ]);

    expect(state.runs.run_a.actions[0].approval?.state).toBe("allowed");
    expect(state.runs.run_a.blocks).toHaveLength(1);
    expect(state.runs.run_a.blocks[0]).toMatchObject({
      type: "tool",
      actionId: "act_1",
    });
    expect(state.runs.run_a.status).toBe("streaming");
    expect(canRespondToApproval(state, "act_1")).toBe(false);
  });
});

describe("ordering, replay and attribution", () => {
  it("ignores a duplicate eventId and never appends the same text twice", () => {
    const first = started();
    const state = applyAll(createTurnsState(), [
      first,
      first,
      delta(2, "once"),
    ]);

    expect(state.runs.run_a.text).toBe("once");
    expect(state.duplicateCount).toBe(1);
  });

  it("refuses a completion after a gap, then accepts one resync snapshot", () => {
    const gapped = applyAll(createTurnsState(), [started(), completed(3)]);

    expect(gapped.runs.run_a.status).toBe("streaming");
    expect(gapped.needsResync).toBe(true);
    expect(gapped.resyncFromSeq).toBe(2);
    expect(gapped.resyncCount).toBe(0);
    expect(resyncRequest(gapped)).toEqual({ afterSeq: 1 });

    const reconciled = reduceTurns(gapped, snapshot(4));
    expect(reconciled.needsResync).toBe(false);
    expect(reconciled.resyncCount).toBe(1);
    expect(resyncRequest(reconciled)).toBeNull();

    const late = reduceTurns(reconciled, delta(2, "late"));
    expect(late.runs.run_a.text).toBe("");
    expect(late.duplicateCount).toBe(1);

    const done = reduceTurns(late, completed(5));
    expect(done.runs.run_a.status).toBe("completed");
  });

  it("accepts an engine stream.resync and reconciles with the snapshot", () => {
    const resynced = applyAll(createTurnsState(), [
      started(),
      delta(2, "before"),
      event(3, "stream.resync", { fromSeq: 2 }),
    ]);

    expect(resynced.needsResync).toBe(true);
    expect(resyncRequest(resynced)).toEqual({ afterSeq: 2 });
    expect(resynced.runs.run_a.text).toBe("before");

    const reconciled = reduceTurns(resynced, snapshot(4));
    expect(reconciled.needsResync).toBe(false);
    expect(reconciled.resyncCount).toBe(1);
    expect(reconciled.runs.run_a.text).toBe("before");
  });

  it("keeps a late completion on its own run without completing the current run", () => {
    const state = applyAll(createTurnsState(), [
      started("run_a", "turn_a"),
      event(2, "turn.started", { runId: "run_b", turnId: "turn_b" }),
      completed(3, "run_a"),
    ]);

    expect(state.currentRunId).toBe("run_b");
    expect(state.runs.run_a.status).toBe("completed");
    expect(state.runs.run_b.status).toBe("streaming");
  });

  it("counts an unknown kind and keeps the sequence moving", () => {
    const unknown = {
      ...event(2, "turn.started", { runId: "run_a", turnId: "turn_a" }),
      kind: "future.event",
      payload: { anything: true },
    } as unknown as SplyceEventEnvelope;
    const state = applyAll(createTurnsState(), [
      started(),
      unknown,
      delta(3, "after unknown"),
    ]);

    expect(state.unknownKindCount).toBe(1);
    expect(state.runs.run_a.text).toBe("after unknown");
    expect(state.needsResync).toBe(false);
  });

  it("rejects a delta that arrives before turn.started", () => {
    const state = applyAll(createTurnsState(), [delta(1, "orphan")]);

    expect(state.runs.run_a).toBeUndefined();
    expect(state.protocolErrors).toBe(1);
  });

  it("preserves partial text and cards through cancel", () => {
    const state = applyAll(createTurnsState(), [
      started(),
      delta(2, "partial answer"),
      toolIntent(3, "act_cancel"),
      event(4, "turn.canceled", { runId: "run_a", cleanedUp: true }),
    ]);

    expect(state.runs.run_a.text).toBe("partial answer");
    expect(state.runs.run_a.actions).toHaveLength(1);
    expect(state.runs.run_a.actions[0].status).toBe("canceled");
    expect(state.runs.run_a.cleanedUp).toBe(true);
  });

  it("never applies an unresolved durable payload and marks the projection stale", () => {
    const { payload: _payload, ...rest } = event(2, "turn.completed", {
      runId: "run_a",
      candidateSnapshotId: "snap",
      finalRevision: "rev",
    });
    const reference = {
      ...rest,
      payloadArtifactId: "art_1",
    } as unknown as SplyceEventEnvelope;
    const state = applyAll(createTurnsState(), [started(), reference]);

    expect(state.runs.run_a.status).toBe("streaming");
    expect(state.stale).toBe(true);
    expect(state.unresolvedPayloadCount).toBe(1);
    expect(state.pendingPayloadIds).toEqual(["evt_2"]);
    expect(state.lastSeq).toBe(2);
  });

  it("skips a transient artifact ref without staling the stream", () => {
    const { payload: _payload, ...rest } = delta(2, "unused");
    const reference = {
      ...rest,
      payloadArtifactId: "art_2",
    } as unknown as SplyceEventEnvelope;
    const state = applyAll(createTurnsState(), [started(), reference]);

    expect(state.runs.run_a.text).toBe("");
    expect(state.stale).toBe(false);
    expect(state.unresolvedPayloadCount).toBe(1);
    expect(state.pendingPayloadIds).toEqual([]);
  });

  it("marks the stream stale on engine.stop without failing the turn", () => {
    const state = applyAll(createTurnsState(), [
      started(),
      event(2, "engine.status", { state: "stopped", activeWorkers: 0 }),
    ]);

    expect(state.stale).toBe(true);
    expect(state.runs.run_a.status).toBe("streaming");
  });
});
