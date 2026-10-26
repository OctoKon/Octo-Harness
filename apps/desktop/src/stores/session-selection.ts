import { writable } from "svelte/store";
import type { TurnStreamTransport } from "./turns";

export interface SessionSelection {
  sessionId: string;
  scopeId: string;
}

/** The workbench (TD-12/TD-30) is the only writer; sessions are never derived from events. */
export const selectedSession = writable<SessionSelection | null>(null);
export const selectSession = (selection: SessionSelection): void =>
  selectedSession.set(selection);
export const clearSession = (): void => selectedSession.set(null);

export type Subscribe = (
  sessionId: string,
  afterSeq?: number,
) => Promise<() => void>;

export interface SelectionBinding {
  resubscribe(sessionId: string, afterSeq: number): Promise<void>;
  dispose(): void;
}

/**
 * Follows and subscribes to the selected session only, releasing the previous
 * one first. The transport accepts events for nothing else.
 */
export function bindSelection(
  transport: Pick<TurnStreamTransport, "follow" | "unfollow" | "current">,
  subscribe: Subscribe,
): SelectionBinding {
  let current: SessionSelection | null = null;
  let release: (() => void) | null = null;
  let generation = 0;

  async function connect(afterSeq: number): Promise<void> {
    const selection = current;
    if (!selection) return;
    const mine = ++generation;
    try {
      const dispose = await subscribe(selection.sessionId, afterSeq);
      if (mine === generation) release = dispose;
      else dispose();
    } catch {
      // The stream stays paused; recovery re-subscribes the selected session.
    }
  }

  function drop(): void {
    generation += 1;
    release?.();
    release = null;
    if (current) transport.unfollow(current.sessionId);
    current = null;
  }

  const unsubscribe = selectedSession.subscribe((selection) => {
    drop();
    if (!selection) return;
    current = selection;
    transport.follow(selection.sessionId, selection.scopeId);
    void connect(transport.current(selection.sessionId).lastDurableSeq);
  });

  return {
    async resubscribe(sessionId, afterSeq) {
      if (current?.sessionId !== sessionId) return;
      generation += 1;
      release?.();
      release = null;
      await connect(afterSeq);
    },
    dispose() {
      unsubscribe();
      drop();
    },
  };
}
