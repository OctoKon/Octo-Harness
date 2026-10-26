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

import {
  type RecordBodies,
  type RecordMetadata,
  TRANSPORT_LIMITS,
} from "./contracts.js";
import { DesktopBridge, type Frame } from "./desktop-bridge.js";
import { Receipts } from "./receipts.js";
import type { Appended, CallerContext, ListResult, Store } from "./store.js";

export class SessionMapError extends Error {
  readonly code: "SESSION_UNKNOWN" | "SESSION_FOREIGN" | "SESSION_NOT_FOLLOWED";

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

/** A run record minus the Pi fields the map stamps from the binding. */
export type RunAnchorInput = Omit<
  RecordBodies["run"],
  "piSessionId" | "branchAnchorId"
> &
  Pick<
    RecordMetadata,
    "schemaVersion" | "recordId" | "createdAt" | "scopeId" | "sourceIds"
  >;

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

interface Bound {
  readonly key: SessionKey;
  readonly piSessionId: string;
  readonly pi: PiSessionView;
}

const keyOf = (key: SessionKey): string =>
  JSON.stringify([key.scopeId, key.sessionId]);

export class SessionMap {
  private readonly byPi = new Map<string, Bound>();
  private readonly byKey = new Map<string, Bound>();
  private readonly channels = new Map<string, SessionChannel>();

  constructor(
    private readonly store: Store,
    private readonly context: MapContext,
  ) {}

  /** Binds a live Pi session to a native Splyce session (invariant 1). */
  bind(key: SessionKey, pi: PiSessionView): AncestryNode {
    const piSessionId = pi.getSessionId();
    const existing = this.byPi.get(piSessionId);
    const occupant = this.byKey.get(keyOf(key));
    if (existing !== undefined || occupant !== undefined) {
      if (existing === undefined || existing !== occupant)
        throw new SessionMapError(
          "SESSION_FOREIGN",
          "Pi session or native session is already bound elsewhere",
        );
      return this.node(existing);
    }
    const bound: Bound = {
      key: Object.freeze({ scopeId: key.scopeId, sessionId: key.sessionId }),
      piSessionId,
      pi,
    };
    this.byPi.set(piSessionId, bound);
    this.byKey.set(keyOf(key), bound);
    return this.node(bound);
  }

  /** The native key bound to a Pi session id. */
  resolve(piSessionId: string): SessionKey {
    return this.bound(piSessionId).key;
  }

  /** Pi-derived ancestry, leaf first (invariant 2). */
  ancestry(piSessionId: string): Ancestry {
    const chain: AncestryNode[] = [];
    const seen = new Set<string>();
    let current: Bound | undefined = this.bound(piSessionId);
    while (current !== undefined && !seen.has(current.piSessionId)) {
      chain.push(this.node(current));
      seen.add(current.piSessionId);
      if (current.pi.getHeader()?.parentSession === undefined)
        return { chain, complete: true };
      current = this.parentOf(current);
    }
    return { chain, complete: false };
  }

  /** Durable, idempotent run anchor under the bound session (invariant 5). */
  anchorRun(piSessionId: string, run: RunAnchorInput): Appended {
    const bound = this.bound(piSessionId);
    const { scopeId, sessionId } = bound.key;
    if (run.scopeId !== scopeId)
      throw new SessionMapError(
        "SESSION_FOREIGN",
        "run scope differs from the bound native scope",
      );
    // ponytail: linear scan of the session's records; add a store index on
    // runId if sessions grow large.
    const existing = this.store
      .list(scopeId, 0, sessionId)
      .records.find(
        (stored) =>
          stored.kind === "run" &&
          (stored.record as RecordBodies["run"]).runId === run.runId,
      );
    if (existing !== undefined)
      return { seq: existing.seq, recordId: existing.record.recordId };
    return this.store.append(
      {
        kind: "run",
        record: {
          ...run,
          piSessionId,
          branchAnchorId: this.anchor(bound).branchAnchorId,
        },
      },
      { ...this.context, sessionId },
    );
  }

  /** The single channel for a bound session plus replay after afterSeq. */
  follow(key: SessionKey, afterSeq: number): FollowResult {
    const bound = this.byKey.get(keyOf(key));
    if (bound === undefined)
      throw new SessionMapError("SESSION_UNKNOWN", "native session not bound");
    let channel = this.channels.get(keyOf(key));
    const receipts = channel?.receipts ?? new Receipts(this.store);
    const replay = receipts.replay(bound.key.scopeId, afterSeq, {
      ...this.context,
      sessionId: bound.key.sessionId,
    });
    if (channel === undefined) {
      const bridge = new DesktopBridge(
        {
          ...bound.key,
          configRevision: this.context.configRevision,
          profileRevision: this.context.profileRevision,
          policyRevision: this.context.policyRevision,
          lastDurableSeq: 0,
          maxInlineBytes: TRANSPORT_LIMITS.maxInlineBytes,
          resolveReference: this.context.resolveReference ?? (() => false),
        },
        receipts,
      );
      channel = Object.freeze({ ...bound.key, receipts, bridge });
      this.channels.set(keyOf(key), channel);
    }
    return { channel, replay };
  }

  /** Stamps native scope/session and submits to the followed bridge. */
  publish(piSessionId: string, event: EngineEvent): Frame | undefined {
    const bound = this.bound(piSessionId);
    if (Object.hasOwn(event, "scopeId") || Object.hasOwn(event, "sessionId"))
      throw new SessionMapError(
        "SESSION_FOREIGN",
        "engine events must not carry scope or session identity",
      );
    const channel = this.channels.get(keyOf(bound.key));
    if (channel === undefined)
      throw new SessionMapError(
        "SESSION_NOT_FOLLOWED",
        "no subscriber; durable records replay by afterSeq",
      );
    return channel.bridge.submit({ ...event, ...bound.key });
  }

  /** Ends a session: binding and channel are dropped together. Idempotent. */
  dispose(key: SessionKey): void {
    const bound = this.byKey.get(keyOf(key));
    if (bound === undefined) return;
    this.byKey.delete(keyOf(key));
    this.byPi.delete(bound.piSessionId);
    this.channels.delete(keyOf(key));
  }

  private bound(piSessionId: string): Bound {
    const bound = this.byPi.get(piSessionId);
    if (bound === undefined)
      throw new SessionMapError("SESSION_UNKNOWN", "Pi session not bound");
    return bound;
  }

  private parentOf(bound: Bound): Bound | undefined {
    const file = bound.pi.getHeader()?.parentSession;
    if (file === undefined) return undefined;
    for (const candidate of this.byPi.values())
      if (candidate.pi.getSessionFile() === file) return candidate;
    return undefined;
  }

  private anchor(bound: Bound): BranchAnchor {
    let forkPointEntryId: string | null = null;
    let firstChildEntryId: string | null = null;
    const parent = this.parentOf(bound);
    if (parent !== undefined) {
      const inherited = new Set(parent.pi.getEntries().map((e) => e.id));
      const entries = bound.pi.getEntries();
      let i = 0;
      while (i < entries.length && inherited.has(entries[i]?.id ?? "")) i += 1;
      forkPointEntryId = i > 0 ? (entries[i - 1]?.id ?? null) : null;
      firstChildEntryId = entries[i]?.id ?? null;
    }
    return {
      branchAnchorId: `anchor-${bound.piSessionId}`,
      piSessionId: bound.piSessionId,
      forkPointEntryId,
      firstChildEntryId,
    };
  }

  private node(bound: Bound): AncestryNode {
    return {
      ...bound.key,
      piSessionId: bound.piSessionId,
      anchor: this.anchor(bound),
    };
  }
}
