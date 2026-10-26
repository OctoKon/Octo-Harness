// TD-15 (issue #37): desktop bridge — the renderer-facing transport surface.
// Submits validated SplyceEvents with bounded frames, a bounded pending queue,
// transient coalescing and the exactly-one-resync overflow rule. Numeric
// constructor options hold the v2 transport limits until the coordinated
// TRANSPORT_LIMITS additive patch lands in contracts (then bound here).
//
// Frozen contract types only; no unfrozen schema or local shim.

import {
  PROTOCOL_VERSION,
  CONTRACT_VERSION,
  type ContractContext,
  type SplyceEvent,
  validateEvent,
} from "./contracts.js";
import { Receipts } from "./receipts.js";

/** v2 transport limits (accepted proposal); replaced by TRANSPORT_LIMITS. */
export const TRANSPORT_LIMIT_OPTIONS = {
  maxInlineBytes: 65536,
  maxEncodedFrameBytes: 262144,
  pendingQueueMaxFrames: 1024,
  pendingQueueMaxBytes: 8388608,
  transientCoalesceWindowMs: 16,
  rendererMaxFrames: 256,
  rendererMaxBytes: 4194304,
} as const;

export type TransportLimitOptions = Partial<typeof TRANSPORT_LIMIT_OPTIONS>;

export class BridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
  }
}

/** A renderer-ready frame: 4-byte big-endian length header + JSON body. */
export interface Frame {
  readonly bytes: number;
  readonly encoded: Uint8Array;
  readonly event: SplyceEvent;
}

export interface DrainResult {
  frames: Frame[];
  /** True when the queue still holds frames beyond the renderer budget. */
  morePending: boolean;
}

export interface BridgeStatus {
  paused: boolean;
  pendingFrames: number;
  pendingBytes: number;
  lastResyncFromSeq: number | undefined;
}

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const eventSeq = (event: SplyceEvent): number => event.seq;

export class DesktopBridge {
  private readonly limits: typeof TRANSPORT_LIMIT_OPTIONS;
  private readonly baseContext: ContractContext;
  private readonly receipts: Receipts;
  /** Pending frames in delivery order (durable and coalesced transient). */
  private queue: Frame[] = [];
  private queueBytes = 0;
  /** Durable saturation: delivery pauses until the renderer resyncs. */
  private paused = false;
  private lastResyncFromSeq: number | undefined;
  /** Per transient kind+runId: {frame, at} for window-based coalescing. */
  private readonly transient = new Map<string, { frame: Frame; at: number }>();

  constructor(
    baseContext: ContractContext,
    receipts: Receipts,
    options: TransportLimitOptions = {},
  ) {
    this.baseContext = baseContext;
    this.receipts = receipts;
    this.limits = { ...TRANSPORT_LIMIT_OPTIONS, ...options };
  }

  private context(): ContractContext {
    return {
      ...this.baseContext,
      lastDurableSeq: this.receipts.durableCursor(),
      maxInlineBytes: this.limits.maxInlineBytes,
    };
  }

  private encode(event: SplyceEvent): Frame {
    const body = new TextEncoder().encode(JSON.stringify(event));
    // 4-byte big-endian header included in the encoded budget.
    const encoded = new Uint8Array(4 + body.byteLength);
    new DataView(encoded.buffer).setUint32(0, body.byteLength, false);
    encoded.set(body, 4);
    return {
      bytes: encoded.byteLength,
      encoded,
      event,
    };
  }

  /**
   * Submits one event for renderer delivery. Validation uses the frozen
   * contract (payload XOR payloadArtifactId, durable flag per kind, inline
   * budget). On any queue overflow the queue is reset and exactly one
   * `stream.resync {fromSeq = durable cursor}` is emitted for the advance.
   */
  submit(value: unknown): Frame | undefined {
    if (this.paused)
      throw new BridgeError(
        "BRIDGE_PAUSED",
        "delivery is paused after overflow; drain the resync first",
      );
    let event: SplyceEvent;
    try {
      event = validateEvent(value, this.context());
    } catch (error) {
      const code = (error as { code?: string }).code ?? "INVALID_SHAPE";
      throw new BridgeError(
        `CONTRACT_${code}`,
        error instanceof Error ? error.message : String(error),
      );
    }
    const frame = this.encode(event);

    if (event.durable) {
      // Durable saturation: refuse further delivery, force a scoped resync.
      // The resync itself is control delivery and is never dropped.
      if (
        this.queue.length + 1 > this.limits.pendingQueueMaxFrames ||
        this.queueBytes + frame.bytes > this.limits.pendingQueueMaxBytes
      ) {
        this.overflow();
        return this.resyncFrame();
      }
      this.queue.push(frame);
      this.queueBytes += frame.bytes;
      return undefined;
    }

    // Transient (stream deltas): coalesce within the window per kind+runId.
    const payload = event.payload as Record<string, unknown> | undefined;
    const runId = typeof payload?.runId === "string" ? payload.runId : "";
    const key = `${event.kind}:${runId}`;
    const now = Date.now();
    const previous = this.transient.get(key);
    if (
      previous !== undefined &&
      now - previous.at <= this.limits.transientCoalesceWindowMs
    ) {
      // Replace the older delta in place: same cost, freshest data.
      const index = this.queue.indexOf(previous.frame);
      if (index >= 0) {
        this.queue[index] = frame;
        this.queueBytes += frame.bytes - previous.frame.bytes;
        this.transient.set(key, { frame, at: now });
        return undefined;
      }
    }
    this.transient.set(key, { frame, at: now });

    if (
      this.queue.length + 1 > this.limits.pendingQueueMaxFrames ||
      this.queueBytes + frame.bytes > this.limits.pendingQueueMaxBytes
    ) {
      // Transient overflow: drop the whole transient backlog (allowed — they
      // are not durable) and emit exactly one resync for the durable cursor.
      this.overflow();
      return this.resyncFrame();
    }
    this.queue.push(frame);
    this.queueBytes += frame.bytes;
    return undefined;
  }

  /** Reset the queue and arm the exactly-one resync (control path reserved). */
  private overflow(): void {
    this.queue = [];
    this.queueBytes = 0;
    this.transient.clear();
    this.paused = true;
  }

  private resyncFrame(): Frame {
    const fromSeq = this.receipts.durableCursor();
    if (fromSeq === 0)
      throw new BridgeError(
        "BRIDGE_OVERFLOW",
        "queue overflow with no durable progress; nothing to resync",
      );
    if (
      this.lastResyncFromSeq !== undefined &&
      fromSeq <= this.lastResyncFromSeq
    )
      throw new BridgeError(
        "RESYNC_NOT_PENDING",
        `no durable progress since the resync at ${String(this.lastResyncFromSeq)}`,
      );
    this.lastResyncFromSeq = fromSeq;
    const event = {
      schemaVersion: CONTRACT_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      recordId: `resync-${String(fromSeq)}`,
      eventId: `resync-${String(fromSeq)}`,
      createdAt: new Date().toISOString(),
      sourceIds: [],
      scopeId: this.baseContext.scopeId,
      sessionId: this.baseContext.sessionId,
      seq: fromSeq,
      durable: true,
      kind: "stream.resync",
      payload: { fromSeq },
    } as SplyceEvent;
    // The resync is control delivery: it must itself validate against the
    // frozen envelope or the bridge is broken — never emit unvalidated.
    try {
      return this.encode(validateEvent(event, this.context()));
    } catch (error) {
      throw new BridgeError(
        `CONTRACT_${(error as { code?: string }).code ?? "INVALID_SHAPE"}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Drains frames up to the renderer budget (256 frames / 4 MiB). Frames are
   * removed from the queue; a paused bridge resumes when the queue empties.
   */
  drain(): DrainResult {
    const frames: Frame[] = [];
    let bytes = 0;
    while (this.queue.length > 0) {
      const frame = this.queue[0];
      if (frame === undefined) break;
      if (
        frames.length >= this.limits.rendererMaxFrames ||
        bytes + frame.bytes > this.limits.rendererMaxBytes
      )
        break;
      this.queue.shift();
      this.queueBytes -= frame.bytes;
      bytes += frame.bytes;
      frames.push(frame);
    }
    if (this.queue.length === 0) this.paused = false;
    return { frames, morePending: this.queue.length > 0 };
  }

  /**
   * Replay after a cursor (exclusive) directly from the durable store, used
   * after a resync: identical semantics to `subscribe afterSeq`.
   */
  replay(afterSeq: number, caller: Parameters<Receipts["replay"]>[2]) {
    return this.receipts.replay(this.baseContext.scopeId, afterSeq, caller);
  }

  status(): BridgeStatus {
    return {
      paused: this.paused,
      pendingFrames: this.queue.length,
      pendingBytes: this.queueBytes,
      lastResyncFromSeq: this.lastResyncFromSeq,
    };
  }

  /** Highest queued durable seq — the renderer's next afterSeq base. */
  highestQueuedSeq(): number {
    let highest = 0;
    for (const frame of this.queue) {
      const seq = eventSeq(frame.event);
      if (seq > highest) highest = seq;
    }
    return highest;
  }
}
