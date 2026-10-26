/**
 * TD-08: Desktop Engine Store and Native Bridge
 *
 * Implements the renderer-to-engine IPC connection layer conforming to TD-02, TD-06,
 * and the frozen @splyce/pi/contracts shared schema (TD-01).
 */

import type {
  CommandOp,
  CommandPayloads,
  EventKind,
  SplyceCommand,
  SplyceEvent,
} from "@splyce/pi/contracts";

export type EngineConnectionState =
  "connecting" | "ready" | "busy" | "disconnected" | "error";

export type EventCallback = (event: SplyceEvent) => void;
export type Unsubscribe = () => void;

export interface EngineStore {
  connectionState: {
    subscribe: (fn: (state: EngineConnectionState) => void) => Unsubscribe;
  };
  subscribe: (sessionId: string, afterSeq?: number) => Unsubscribe;
  onEvent: (callback: EventCallback) => Unsubscribe;
  invoke: <O extends CommandOp>(
    op: O,
    payload: CommandPayloads[O],
    correlationId?: string,
  ) => Promise<unknown>;
  ackCursor: (sessionId: string, seq: number) => Promise<void>;
  resync: (sessionId: string, fromSeq: number) => Promise<void>;
}

// Internal reactive state
let currentState: EngineConnectionState = "ready";
const stateListeners = new Set<(state: EngineConnectionState) => void>();
const eventListeners = new Set<EventCallback>();
let lastAckedSequence = 0;

function notifyState(next: EngineConnectionState) {
  currentState = next;
  for (const listener of stateListeners) {
    listener(currentState);
  }
}

/**
 * Readable connection state store
 */
export const connectionState = {
  subscribe(fn: (state: EngineConnectionState) => void): Unsubscribe {
    fn(currentState);
    stateListeners.add(fn);
    return () => stateListeners.delete(fn);
  },
};

/**
 * Register a listener for incoming engine push events
 */
export function onEvent(callback: EventCallback): Unsubscribe {
  eventListeners.add(callback);
  return () => eventListeners.delete(callback);
}

/**
 * Internal event dispatcher used by the Tauri IPC listener or fixture runners
 */
export function dispatchEngineEvent(event: SplyceEvent): void {
  for (const listener of eventListeners) {
    listener(event);
  }
}

/**
 * Subscribe to a session stream starting after a monotonic sequence
 */
export function subscribe(sessionId: string, afterSeq?: number): Unsubscribe {
  const fromSeq = afterSeq ?? lastAckedSequence;
  // Dispatches native subscribe command
  invoke("session.subscribe", { afterSeq: fromSeq }).catch((err) => {
    notifyState("error");
    console.error("Failed to subscribe to engine session:", err);
  });
  return () => {
    // Unsubscribe cleanup
  };
}

/**
 * Invoke a typed engine command conforming to TD-01 shared contract
 */
export async function invoke<O extends CommandOp>(
  op: O,
  payload: CommandPayloads[O],
  correlationId = `req_${Date.now()}`,
): Promise<unknown> {
  const commandInput = {
    protocolVersion: 1,
    correlationId,
    sessionId: (payload as { sessionId?: string })?.sessionId ?? "default",
    scopeId: (payload as { scopeId?: string })?.scopeId ?? "default",
    expectedConfigRevision: "v1",
    expectedProfileRevision: "v1",
    expectedPolicyRevision: "v1",
    op,
    payload,
  };

  if (
    typeof window !== "undefined" &&
    (window as unknown as { __TAURI__?: unknown }).__TAURI__
  ) {
    const tauri = (
      window as unknown as {
        __TAURI__: {
          core: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
        };
      }
    ).__TAURI__;
    return await tauri.core.invoke("send", commandInput);
  }

  // Headless / mock fallback for testing
  return { ok: true };
}

/**
 * Acknowledge durable event sequence
 */
export async function ackCursor(sessionId: string, seq: number): Promise<void> {
  lastAckedSequence = Math.max(lastAckedSequence, seq);
}

/**
 * Request a stream resync snapshot after a sequence gap
 */
export async function resync(
  sessionId: string,
  fromSeq: number,
): Promise<void> {
  await invoke("session.subscribe", { afterSeq: fromSeq });
}

export const engine: EngineStore = {
  connectionState,
  subscribe,
  onEvent,
  invoke,
  ackCursor,
  resync,
};
