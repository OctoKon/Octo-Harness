// TD-10 (issue #78): C1 ancestry/events — the authoritative map between Pi
// session ids and native Splyce (scopeId, sessionId), plus the host point
// that owns one subscribed DesktopBridge+Receipts per Splyce session.
//
// Invariants:
// 1. One Pi session id maps to exactly one native (scopeId, sessionId) and
//    back. Rebinding the same pair is idempotent; any other pair is
//    SESSION_FOREIGN. Unbound ids are SESSION_UNKNOWN.
// 2. Ancestry is Pi-derived, never invented: the parent is the bound session
//    whose Pi file is this header's `parentSession`; the fork point is the
//    last entry of the prefix copied from the parent; `firstChildEntryId` is
//    the first entry after it and stays null until Pi has one. An unbound
//    parent is reported unresolved, never fabricated.
// 3. scopeId/sessionId on every published event come from the binding (the
//    native side). An engine event that carries its own is rejected.
// 4. At most one channel (DesktopBridge+Receipts) per (scopeId, sessionId);
//    `dispose` drops binding and channel together. A later follow starts a
//    fresh bridge whose replay continues strictly after the caller's afterSeq.
// 5. Run anchors are durable `run` records written under the bound session;
//    repeating a runId returns the existing anchor, never a duplicate.
// Event seq, cursor and replay semantics belong to TD-15 (Receipts and
// DesktopBridge); this module only binds and routes.

import type { RecordBodies } from "./contracts.js";
import { DesktopBridge, type Frame } from "./desktop-bridge.js";
import { Receipts } from "./receipts.js";
import type { Appended, CallerContext, ListResult, Store } from "./store.js";

export class SessionMapError extends Error {
  readonly code:
    | "SESSION_UNKNOWN"
    | "SESSION_FOREIGN"
    | "SESSION_NOT_FOLLOWED"
    | "NOT_IMPLEMENTED";

  constructor(code: SessionMapError["code"], message: string) {
    super(message);
    this.name = "SessionMapError";
    this.code = code;
  }
}

/** Native-owned Splyce identity of a session. */
export interface SessionKey {
  readonly scopeId: string;
  readonly sessionId: string;
}

/** The read surface of a live Pi `SessionManager` the map derives from. */
export interface PiSessionView {
  getSessionId(): string;
  getSessionFile(): string | undefined;
  getHeader(): { readonly parentSession?: string } | null;
  getEntries(): readonly { readonly id: string }[];
}

/** Splyce branch anchor (implementation-contracts: branch anchor). */
export interface BranchAnchor {
  readonly branchAnchorId: string;
  readonly piSessionId: string;
  readonly forkPointEntryId: string | null;
  readonly firstChildEntryId: string | null;
}

export interface AncestryNode extends SessionKey {
  readonly piSessionId: string;
  readonly anchor: BranchAnchor;
}

/** Leaf-to-root chain; `complete` is false when a parent is not bound. */
export interface Ancestry {
  readonly chain: readonly AncestryNode[];
  readonly complete: boolean;
}

/** Revisions/reference resolver shared by every session the map serves. */
export type MapContext = Omit<CallerContext, "sessionId">;

/** A run anchor minus the fields the map stamps from the binding. */
export type RunAnchorInput = Omit<
  RecordBodies["run"],
  "piSessionId" | "branchAnchorId"
> & {
  recordId: string;
  createdAt: string;
  sourceIds: string[];
};

/** An engine event without scope/session: the map stamps both. */
export type EngineEvent = Readonly<Record<string, unknown>>;

/** The per-session subscription the renderer's follow() and #61 bind to. */
export interface SessionChannel extends SessionKey {
  readonly receipts: Receipts;
  readonly bridge: DesktopBridge;
}

export interface FollowResult {
  readonly channel: SessionChannel;
  /** Durable records with seq > afterSeq for this session only. */
  readonly replay: ListResult;
}

export class SessionMap {
  constructor(
    private readonly store: Store,
    private readonly context: MapContext,
  ) {}

  /** Binds a live Pi session to a native Splyce session (invariant 1). */
  bind(key: SessionKey, pi: PiSessionView): AncestryNode {
    void key;
    void pi;
    throw notImplemented();
  }

  /** The native key bound to a Pi session id. */
  resolve(piSessionId: string): SessionKey {
    void piSessionId;
    throw notImplemented();
  }

  /** Pi-derived ancestry, leaf first (invariant 2). */
  ancestry(piSessionId: string): Ancestry {
    void piSessionId;
    throw notImplemented();
  }

  /** Durable, idempotent run anchor under the bound session (invariant 5). */
  anchorRun(piSessionId: string, run: RunAnchorInput): Appended {
    void piSessionId;
    void run;
    throw notImplemented();
  }

  /** The single channel for a bound session plus replay after afterSeq. */
  follow(key: SessionKey, afterSeq: number): FollowResult {
    void key;
    void afterSeq;
    throw notImplemented();
  }

  /** Stamps native scope/session and submits to the followed bridge. */
  publish(piSessionId: string, event: EngineEvent): Frame | undefined {
    void piSessionId;
    void event;
    throw notImplemented();
  }

  /** Ends a session: binding and channel are dropped together. */
  dispose(key: SessionKey): void {
    void key;
    throw notImplemented();
  }
}

const notImplemented = () =>
  new SessionMapError("NOT_IMPLEMENTED", "TD-10 implementation pending");
