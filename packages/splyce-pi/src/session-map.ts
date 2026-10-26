// TD-10 (issue #78): C1 ancestry/events — the authoritative map between Pi
// session ids and native Splyce (scopeId, sessionId), plus the host point
// that owns one subscribed DesktopBridge+Receipts per Splyce session.
//
// Invariants:
// 1. One Pi session id maps to exactly one native (scopeId, sessionId) and
//    back. Rebinding the same pair is idempotent; any other pair is
//    SESSION_FOREIGN. Unbound ids are SESSION_UNKNOWN.
// 2. Ancestry is Pi-derived, never invented. It follows Pi's active branch
//    (`getLeafId`/`getBranch`): a session's base anchor starts at its fork
//    point (the last entry copied from the bound parent, whose file is this
//    header's `parentSession`); inside a session, an entry that is not the
//    first child of its parent opens a new anchor, so every leaf resolves to
//    a stable, distinct anchor chain and switching back restores it.
//    `firstChildEntryId` stays null until Pi has one. An unbound parent is
//    reported unresolved (`complete: false`), never guessed.
// 3. Anchors are durable `branchAnchor` records under the owning session; a
//    changed anchor (e.g. first child resolved) is appended next to its
//    predecessor, never rewritten, and an unchanged one is never duplicated.
// 4. scopeId/sessionId on every published event come from the binding (the
//    native side). An engine event that carries its own is rejected.
// 5. At most one channel (DesktopBridge+Receipts) per (scopeId, sessionId).
//    `unfollow` releases only the channel (renderer left); `dispose` ends the
//    session (binding and channel). A later follow starts a fresh bridge
//    whose replay continues strictly after the caller's afterSeq.
// 6. Publishing never depends on a follower: events are validated first;
//    with no follower, durable events are already committed records that
//    replay by afterSeq and transient deltas are discarded.
// 7. Run anchors are durable `run` records under the bound session, bound to
//    the active branch anchor; repeating a runId returns the existing anchor.
// Event seq, cursor and replay semantics belong to TD-15 (Receipts and
// DesktopBridge); this module only binds and routes.

import {
  type ContractContext,
  type RecordBodies,
  type RecordMetadata,
  TRANSPORT_LIMITS,
  validateEvent,
} from "./contracts.js";
import { BridgeError, DesktopBridge, type Frame } from "./desktop-bridge.js";
import { Receipts } from "./receipts.js";
import type { Appended, CallerContext, ListResult, Store } from "./store.js";

export class SessionMapError extends Error {
  readonly code: "SESSION_UNKNOWN" | "SESSION_FOREIGN";

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

/** A Pi session entry as far as ancestry needs it. */
export interface PiEntryView {
  readonly id: string;
  readonly parentId: string | null;
}

/** The read surface of a live Pi `SessionManager` the map derives from. */
export interface PiSessionView {
  getSessionId(): string;
  getSessionFile(): string | undefined;
  getHeader(): { readonly parentSession?: string } | null;
  getEntries(): readonly PiEntryView[];
  getLeafId(): string | null;
  getBranch(fromId?: string): readonly PiEntryView[];
}

/** Splyce branch anchor: the frozen `branchAnchor` record body. */
export type BranchAnchor = Readonly<RecordBodies["branchAnchor"]>;

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

const ANCHOR_FIELDS = [
  "piSessionId",
  "parentAnchorId",
  "forkPointEntryId",
  "firstChildEntryId",
  "activeLeafEntryId",
] as const;

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
      return this.persist(existing);
    }
    const bound: Bound = {
      key: Object.freeze({ scopeId: key.scopeId, sessionId: key.sessionId }),
      piSessionId,
      pi,
    };
    this.byPi.set(piSessionId, bound);
    this.byKey.set(keyOf(key), bound);
    return this.persist(bound);
  }

  /** The native key bound to a Pi session id. */
  resolve(piSessionId: string): SessionKey {
    return this.bound(piSessionId).key;
  }

  /** Pi-derived active ancestry, leaf first (invariant 2). */
  ancestry(piSessionId: string): Ancestry {
    const bound = this.bound(piSessionId);
    return this.chain(bound, bound.pi.getLeafId(), new Set());
  }

  /** Durable, idempotent run anchor on the active branch (invariant 7). */
  anchorRun(piSessionId: string, run: RunAnchorInput): Appended {
    const bound = this.bound(piSessionId);
    const { scopeId, sessionId } = bound.key;
    if (run.scopeId !== scopeId)
      throw new SessionMapError(
        "SESSION_FOREIGN",
        "run scope differs from the bound native scope",
      );
    const active = this.persist(bound);
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
          branchAnchorId: active.anchor.branchAnchorId,
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
      const bridge = new DesktopBridge(this.contractContext(bound), receipts);
      channel = Object.freeze({ ...bound.key, receipts, bridge });
      this.channels.set(keyOf(key), channel);
    }
    return { channel, replay };
  }

  /** The renderer left: release its channel; the session stays bound. */
  unfollow(key: SessionKey): void {
    this.channels.delete(keyOf(key));
  }

  /**
   * Stamps native scope/session and validates; delivers to the follower if
   * any. With none, returns undefined: durable events replay from their
   * committed records, transient deltas are discarded (invariant 6).
   */
  publish(piSessionId: string, event: EngineEvent): Frame | undefined {
    const bound = this.bound(piSessionId);
    if (Object.hasOwn(event, "scopeId") || Object.hasOwn(event, "sessionId"))
      throw new SessionMapError(
        "SESSION_FOREIGN",
        "engine events must not carry scope or session identity",
      );
    const stamped = { ...event, ...bound.key };
    const channel = this.channels.get(keyOf(bound.key));
    if (channel !== undefined) return channel.bridge.submit(stamped);
    try {
      validateEvent(stamped, this.contractContext(bound));
    } catch (error) {
      throw new BridgeError(
        `CONTRACT_${(error as { code?: string }).code ?? "INVALID_SHAPE"}`,
        error instanceof Error ? error.message : String(error),
      );
    }
    return undefined;
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

  private contractContext(bound: Bound): ContractContext {
    return {
      ...bound.key,
      configRevision: this.context.configRevision,
      profileRevision: this.context.profileRevision,
      policyRevision: this.context.policyRevision,
      lastDurableSeq: this.store.cursor(),
      maxInlineBytes: TRANSPORT_LIMITS.maxInlineBytes,
      resolveReference: this.context.resolveReference ?? (() => false),
    };
  }

  private parentOf(bound: Bound): Bound | undefined {
    const file = bound.pi.getHeader()?.parentSession;
    if (file === undefined) return undefined;
    for (const candidate of this.byPi.values())
      if (candidate.pi.getSessionFile() === file) return candidate;
    return undefined;
  }

  /** Anchor chain of `bound` with its active leaf at `leafId` (invariant 2). */
  private chain(
    bound: Bound,
    leafId: string | null,
    seen: Set<string>,
  ): Ancestry {
    seen.add(bound.piSessionId);
    const node = (anchor: BranchAnchor): AncestryNode => ({
      ...bound.key,
      piSessionId: bound.piSessionId,
      anchor,
    });
    const baseId = `anchor-${bound.piSessionId}`;
    const hasParent = bound.pi.getHeader()?.parentSession !== undefined;
    const parent = this.parentOf(bound);
    if (hasParent && (parent === undefined || seen.has(parent.piSessionId)))
      return {
        chain: [
          node({
            branchAnchorId: baseId,
            piSessionId: bound.piSessionId,
            parentAnchorId: null,
            forkPointEntryId: null,
            firstChildEntryId: null,
            activeLeafEntryId: leafId,
          }),
        ],
        complete: false,
      };

    const inherited = new Set(parent?.pi.getEntries().map((e) => e.id) ?? []);
    const entries = bound.pi.getEntries();
    const firstChild = (parentId: string | null): string | null =>
      entries.find((e) => e.parentId === parentId && !inherited.has(e.id))
        ?.id ?? null;
    const path = leafId === null ? [] : bound.pi.getBranch(leafId);
    let forkPoint: string | null = null;
    const segments: { fork: string | null; first: string | null }[] = [];
    for (const entry of path) {
      if (inherited.has(entry.id)) {
        forkPoint = entry.id;
        continue;
      }
      if (segments.length === 0)
        segments.push({ fork: forkPoint, first: firstChild(forkPoint) });
      if (entry.id !== firstChild(entry.parentId))
        segments.push({ fork: entry.parentId, first: entry.id });
    }
    if (segments.length === 0)
      segments.push({ fork: forkPoint, first: firstChild(forkPoint) });

    const upstream =
      parent === undefined ? undefined : this.chain(parent, forkPoint, seen);
    const anchors: BranchAnchor[] = [];
    segments.forEach((segment, i) => {
      anchors.push({
        branchAnchorId:
          i === 0 ? baseId : `${baseId}-${segment.first ?? "pending"}`,
        piSessionId: bound.piSessionId,
        parentAnchorId:
          i === 0
            ? (upstream?.chain[0]?.anchor.branchAnchorId ?? null)
            : (anchors[i - 1]?.branchAnchorId ?? null),
        forkPointEntryId: segment.fork,
        firstChildEntryId: segment.first,
        activeLeafEntryId: segments[i + 1]?.fork ?? leafId,
      });
    });
    return {
      chain: [...anchors.reverse().map(node), ...(upstream?.chain ?? [])],
      complete: upstream?.complete ?? true,
    };
  }

  /**
   * Appends the session's own active anchors that differ from their latest
   * stored record (invariant 3) and returns the active node.
   */
  private persist(bound: Bound): AncestryNode {
    const { chain } = this.ancestry(bound.piSessionId);
    const { scopeId, sessionId } = bound.key;
    // ponytail: rescans the session's records per call; index by anchor id
    // if sessions grow large.
    const stored = new Map<string, RecordBodies["branchAnchor"][]>();
    for (const { kind, record } of this.store.list(scopeId, 0, sessionId)
      .records)
      if (kind === "branchAnchor") {
        const anchor = record as RecordMetadata & RecordBodies["branchAnchor"];
        stored.set(anchor.branchAnchorId, [
          ...(stored.get(anchor.branchAnchorId) ?? []),
          anchor,
        ]);
      }
    for (const { piSessionId, anchor } of chain) {
      if (piSessionId !== bound.piSessionId) continue;
      const history = stored.get(anchor.branchAnchorId) ?? [];
      const latest = history.at(-1);
      if (
        latest !== undefined &&
        ANCHOR_FIELDS.every((field) => latest[field] === anchor[field])
      )
        continue;
      this.store.append(
        {
          kind: "branchAnchor",
          record: {
            schemaVersion: 1,
            recordId: `${anchor.branchAnchorId}.${String(history.length + 1)}`,
            createdAt: new Date().toISOString(),
            scopeId,
            sourceIds: [],
            ...anchor,
          },
        },
        { ...this.context, sessionId },
      );
    }
    const active = chain[0];
    if (active === undefined) throw new Error("ancestry chain is never empty");
    return active;
  }
}
