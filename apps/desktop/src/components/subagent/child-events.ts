import type { SubagentChild, SubagentCitation } from "./merge";

export type SubagentChildMode = "read" | "write";
export type SubagentChildStatus =
  "running" | "completed" | "failed" | "cancelled";

type ChildIdentity = {
  readonly runId: string;
  readonly childId: string;
};

export type SubagentChildEvent =
  | {
      readonly kind: "child.started";
      readonly payload: ChildIdentity & { readonly mode: SubagentChildMode };
    }
  | {
      readonly kind: "child.progress";
      readonly payload: ChildIdentity & {
        readonly turns: number;
        readonly tokens: number;
      };
    }
  | {
      readonly kind: "child.completed";
      readonly payload: ChildIdentity & {
        readonly summary: string;
        readonly citations: readonly string[];
        readonly files?: readonly string[];
      };
    }
  | {
      readonly kind: "child.failed";
      readonly payload: ChildIdentity & {
        readonly reason: string;
        /** Engine detail; intentionally not stored or rendered. */
        readonly message?: string;
      };
    }
  | {
      readonly kind: "child.cancelled";
      readonly payload: ChildIdentity & { readonly cleanedUp: boolean };
    };

export interface SubagentChildView {
  readonly childId: string;
  readonly runId: string;
  readonly mode?: SubagentChildMode;
  readonly status: SubagentChildStatus;
  readonly turns: number;
  readonly tokens: number;
  readonly summary?: string;
  readonly citations: readonly string[];
  readonly files: readonly string[];
  readonly failureReason?: string;
  readonly cleanedUp?: boolean;
}

export interface SubagentChildrenState {
  readonly children: Readonly<Record<string, SubagentChildView>>;
}

export function createSubagentChildren(): SubagentChildrenState {
  return { children: {} };
}

function fresh(
  payload: ChildIdentity,
  mode: SubagentChildMode | undefined,
): SubagentChildView {
  return {
    childId: payload.childId,
    runId: payload.runId,
    ...(mode ? { mode } : {}),
    status: "running",
    turns: 0,
    tokens: 0,
    citations: [],
    files: [],
  };
}

function isTerminal(status: SubagentChildStatus): boolean {
  return (
    status === "completed" || status === "failed" || status === "cancelled"
  );
}

/**
 * Folds the engine's `child.*` events. Later events never regress a terminal
 * child, a new run resets the view for a reused child id, and failure messages
 * are discarded rather than surfaced as raw engine text.
 */
export function applyChildEvent(
  state: SubagentChildrenState,
  event: SubagentChildEvent,
): SubagentChildrenState {
  const payload = event.payload;
  const previous = state.children[payload.childId];
  const sameRun = previous?.runId === payload.runId;
  const current = sameRun && previous ? previous : fresh(payload, undefined);

  let next: SubagentChildView;
  switch (event.kind) {
    case "child.started":
      next = fresh(payload, event.payload.mode);
      break;
    case "child.progress":
      if (sameRun && isTerminal(current.status)) return state;
      next = {
        ...current,
        turns: event.payload.turns,
        tokens: event.payload.tokens,
      };
      break;
    case "child.completed":
      next = {
        ...current,
        status: "completed",
        summary: event.payload.summary,
        citations: [...event.payload.citations],
        files: [...(event.payload.files ?? [])],
      };
      break;
    case "child.failed":
      next = {
        ...current,
        status: "failed",
        failureReason: event.payload.reason,
      };
      break;
    case "child.cancelled":
      next = {
        ...current,
        status: "cancelled",
        cleanedUp: event.payload.cleanedUp,
      };
      break;
  }

  return {
    ...state,
    children: { ...state.children, [payload.childId]: next },
  };
}

/** A `path[:line]` citation; line 0 means the event did not carry a line. */
export function parseCitation(value: string): SubagentCitation {
  const colon = value.lastIndexOf(":");
  if (colon <= 0) return { path: value, line: 0 };
  const line = Number(value.slice(colon + 1));
  if (!Number.isInteger(line) || line < 1) return { path: value, line: 0 };
  return { path: value.slice(0, colon), line };
}

/** Project a tracked child into the merge-back panel's view model. */
export function toSubagentChild(view: SubagentChildView): SubagentChild {
  return {
    childId: view.childId,
    parentRunId: view.runId,
    status: view.status,
    ...(view.summary ? { summary: view.summary } : {}),
    citations: view.citations.map(parseCitation),
  };
}
