/**
 * TD-33: session lifecycle actions (D4_session_resume_fork).
 *
 * Fork, resume and rewind are modelled here as typed request intents, not as
 * effects. TD-31's transitions are not landed, so nothing in this module
 * invents an engine answer: the reducer either hands the caller exactly one
 * request to execute or refuses with a visible reason.
 *
 * The action always targets the ancestry the tree actually received. Fork and
 * rewind capture the selected branch anchor when they start; a rewind that is
 * confirmed after the selection changed is refused instead of being applied to
 * a target the user is no longer looking at.
 *
 * Rewind is destructive and requires an explicit confirmation. It also
 * presents TD-25's `C3_user_rewind` choices and limits: code restore is a
 * receipted effect that does not exist yet, so only the conversation rewind
 * (fork-style ancestry, source kept) can be admitted.
 */

export type SessionActionKind = "resume" | "fork" | "rewind";

/** What a rewind restores. Code restore is TD-25's receipted effect. */
export type RewindChoice = "conversation" | "code" | "both";

export type SessionActionPhase =
  "idle" | "confirming" | "requesting" | "succeeded" | "canceled" | "failed";

export interface CapabilityAvailability {
  readonly status: "ready" | "unavailable";
  /** Shown verbatim when the capability is unavailable; never null then. */
  readonly reason: string | null;
}

/** The engine ancestry the renderer actually knows for the selected node. */
export interface SelectedAncestry {
  readonly sessionId: string;
  readonly branchAnchorId: string;
  readonly leaves: readonly string[];
}

export interface SessionActionsContext {
  /** Session revisions are not delivered yet, so a request cannot be admitted. */
  readonly engine: CapabilityAvailability;
  /** Conversation rewind is a fork-style request; unavailable until admitted. */
  readonly rewind: CapabilityAvailability;
  /** Restoring admitted code edits is TD-25's receipted effect. */
  readonly codeRestore: CapabilityAvailability;
  readonly selected: SelectedAncestry | null;
  /** Current editor text, captured so a lifecycle request never drops it. */
  readonly draft: string;
}

/** The typed intent the caller may execute. It names no transport op on purpose. */
export interface SessionActionRequest {
  readonly kind: SessionActionKind;
  readonly sourceSessionId: string;
  /** Fork/rewind position; null for resume. */
  readonly entryId: string | null;
  /** Rewind scope; null for fork and resume. */
  readonly choice: RewindChoice | null;
}

export interface SessionActionState {
  readonly phase: SessionActionPhase;
  readonly kind: SessionActionKind | null;
  readonly choice: RewindChoice | null;
  /** Ancestry captured when the action began; the request can only use this. */
  readonly target: SelectedAncestry | null;
  /** Editor text captured when the action began; a cancel or failure keeps it. */
  readonly preservedDraft: string | null;
  /** Set only while a request is ready to execute. */
  readonly request: SessionActionRequest | null;
  readonly error: string | null;
  /** Why the last attempt was refused; cleared by the next accepted action. */
  readonly blocked: string | null;
}

export type SessionAction =
  | { type: "begin"; kind: Exclude<SessionActionKind, "rewind"> }
  | { type: "begin"; kind: "rewind" }
  | { type: "choose"; choice: RewindChoice }
  | { type: "confirm" }
  | { type: "cancel" }
  | { type: "succeeded" }
  | { type: "failed"; message: string };

export interface ActionAvailability {
  readonly enabled: boolean;
  readonly reason: string | null;
}

/** TD-25 `C3_user_rewind` limits, stated before the destructive action. */
export const REWIND_LIMITS: readonly string[] = Object.freeze([
  "Shell commands and external edits are not restored.",
  "Prior external effects are not undoable.",
  "The source conversation is kept: rewind forks its ancestry and never deletes it.",
]);

const READY: ActionAvailability = Object.freeze({
  enabled: true,
  reason: null,
});

const blocked = (reason: string): ActionAvailability => ({
  enabled: false,
  reason,
});

const KIND_LABEL: Record<SessionActionKind, string> = {
  resume: "resume",
  fork: "fork",
  rewind: "rewind",
};

export function createSessionActionState(): SessionActionState {
  return {
    phase: "idle",
    kind: null,
    choice: null,
    target: null,
    preservedDraft: null,
    request: null,
    error: null,
    blocked: null,
  };
}

const engineReason = (context: SessionActionsContext): string | null =>
  context.engine.status === "ready"
    ? null
    : (context.engine.reason ?? "The engine is unavailable.");

const selectionReason = (context: SessionActionsContext): string | null =>
  context.selected === null ? "Select a session branch first." : null;

/**
 * The capability/selection block, independent of the phase. Starting an action
 * adds the phase gates; confirming a rewind is already in `confirming` and must
 * not be refused by its own phase.
 */
function capabilityBlock(
  context: SessionActionsContext,
  kind: SessionActionKind,
): string | null {
  const engine = engineReason(context);
  if (engine !== null) return engine;
  const selection = selectionReason(context);
  if (selection !== null) return selection;
  if (kind === "rewind" && context.rewind.status !== "ready")
    return context.rewind.reason ?? "Rewind is unavailable.";
  return null;
}

/**
 * Why a lifecycle action cannot start. Order matters: an unavailable engine is
 * reported before the missing selection, so a user without both sees the
 * blocking cause instead of a misleading one.
 */
export function actionAvailability(
  context: SessionActionsContext,
  state: SessionActionState,
  kind: SessionActionKind,
): ActionAvailability {
  if (state.phase === "requesting")
    return blocked(`A ${KIND_LABEL[kind]} request is already in flight.`);
  if (state.phase === "confirming")
    return blocked("Finish or cancel the rewind confirmation first.");
  const capability = capabilityBlock(context, kind);
  return capability === null ? READY : blocked(capability);
}

/** Rewind choices are per-choice because code restore needs TD-25 receipts. */
export function rewindChoiceAvailability(
  context: SessionActionsContext,
  choice: RewindChoice,
): ActionAvailability {
  if (choice === "conversation") {
    if (context.rewind.status !== "ready")
      return blocked(context.rewind.reason ?? "Rewind is unavailable.");
    return READY;
  }
  if (context.codeRestore.status !== "ready")
    return blocked(
      context.codeRestore.reason ?? "Code restore is unavailable.",
    );
  return READY;
}

/** The ancestry label shown to the user; exactly the engine ids, never a guess. */
export function forkPointLabel(target: SelectedAncestry | null): string | null {
  return target === null
    ? null
    : `${target.sessionId} / ${target.branchAnchorId}`;
}

function requested(
  state: SessionActionState,
  context: SessionActionsContext,
  kind: SessionActionKind,
  choice: RewindChoice | null,
): SessionActionState {
  const target = context.selected;
  if (target === null) return { ...state, blocked: selectionReason(context) };
  return {
    phase: "requesting",
    kind,
    choice,
    target,
    preservedDraft: state.preservedDraft ?? context.draft,
    request: {
      kind,
      sourceSessionId: target.sessionId,
      // Resume reopens the session itself; fork and rewind name the ancestry.
      entryId: kind === "resume" ? null : target.branchAnchorId,
      choice,
    },
    error: null,
    blocked: null,
  };
}

export function reduceSessionAction(
  state: SessionActionState,
  action: SessionAction,
  context: SessionActionsContext,
): SessionActionState {
  switch (action.type) {
    case "begin": {
      const availability = actionAvailability(context, state, action.kind);
      if (!availability.enabled)
        return { ...state, blocked: availability.reason };
      // Every new action captures the editor as it is now; a previous action's
      // snapshot must not be carried into this one.
      const started = { ...state, preservedDraft: context.draft };
      if (action.kind === "rewind") {
        const selected = context.selected;
        if (selected === null)
          return { ...state, blocked: selectionReason(context) };
        // Destructive: never produce a request before the user confirms.
        return {
          phase: "confirming",
          kind: "rewind",
          choice: "conversation",
          target: selected,
          preservedDraft: context.draft,
          request: null,
          error: null,
          blocked: null,
        };
      }
      return requested(started, context, action.kind, null);
    }
    case "choose": {
      if (state.phase !== "confirming" || state.kind !== "rewind") return state;
      const availability = rewindChoiceAvailability(context, action.choice);
      return {
        ...state,
        choice: action.choice,
        blocked: availability.enabled ? null : availability.reason,
      };
    }
    case "confirm": {
      // Only a rewind can be confirming, and only a confirmation may request it.
      if (state.phase !== "confirming" || state.kind !== "rewind") return state;
      const capability = capabilityBlock(context, "rewind");
      if (capability !== null) return { ...state, blocked: capability };
      const selected = context.selected;
      if (
        selected === null ||
        state.target === null ||
        selected.sessionId !== state.target.sessionId ||
        selected.branchAnchorId !== state.target.branchAnchorId
      )
        // The dialog must not rewind a target that is no longer selected.
        return {
          ...state,
          blocked:
            "The selected branch changed; review the new rewind target before confirming.",
        };
      const choice = state.choice ?? "conversation";
      const choiceAvailability = rewindChoiceAvailability(context, choice);
      if (!choiceAvailability.enabled)
        return { ...state, blocked: choiceAvailability.reason };
      return requested(state, context, "rewind", choice);
    }
    case "cancel": {
      if (state.phase !== "confirming" && state.phase !== "requesting")
        return state;
      // Cancellation is its own outcome: no request survives and the draft stays.
      return {
        ...state,
        phase: "canceled",
        request: null,
        error: null,
        blocked: null,
      };
    }
    case "succeeded": {
      // A result may only settle a request that actually left the UI.
      if (state.phase !== "requesting") return state;
      return {
        ...state,
        phase: "succeeded",
        request: null,
        error: null,
        blocked: null,
      };
    }
    case "failed": {
      if (state.phase !== "requesting") return state;
      return {
        ...state,
        phase: "failed",
        request: null,
        error: action.message,
        blocked: null,
      };
    }
  }
}
