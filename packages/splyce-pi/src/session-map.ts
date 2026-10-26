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
  TRANSPORT_LIMITS,
  type ContractContext,
  type RecordBodies,
} from "./contracts.js";
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
  private readonly piToKey = new Map<string, SessionKey>();
  private readonly keyToPi = new Map<string, string>();
  private readonly fileToPi = new Map<string, string>();
  private readonly piViews = new Map<string, PiSessionView>();
  private readonly runAnchors = new Map<string, Map<string, Appended>>();
  private readonly channels = new Map<string, SessionChannel>();

  constructor(
    private readonly store: Store,
    private readonly context: MapContext,
  ) {}

  private keyStr(key: SessionKey): string {
    return `${key.scopeId}:${key.sessionId}`;
  }

  private computeNode(key: SessionKey, pi: PiSessionView): AncestryNode {
    const piSessionId = pi.getSessionId();
    const header = pi.getHeader();
    const entries = pi.getEntries();
    const parentFile = header?.parentSession;

    let forkPointEntryId: string | null = null;
    let firstChildEntryId: string | null = null;

    if (parentFile) {
      let parentPiId: string | undefined = this.fileToPi.get(parentFile);
      if (!parentPiId) {
        for (const [id, view] of this.piViews.entries()) {
          if (id === parentFile || view.getSessionFile() === parentFile) {
            parentPiId = id;
            break;
          }
        }
      }
      const parentView = parentPiId ? this.piViews.get(parentPiId) : undefined;
      if (parentView) {
        const parentEntries = parentView.getEntries();
        let commonPrefixLen = 0;
        while (
          commonPrefixLen < entries.length &&
          commonPrefixLen < parentEntries.length &&
          entries[commonPrefixLen]!.id === parentEntries[commonPrefixLen]!.id
        ) {
          commonPrefixLen++;
        }
        forkPointEntryId =
          commonPrefixLen > 0 ? entries[commonPrefixLen - 1]!.id : null;
        firstChildEntryId =
          entries.length > commonPrefixLen
            ? entries[commonPrefixLen]!.id
            : null;
      }
    } else {
      forkPointEntryId = null;
      firstChildEntryId = entries.length > 0 ? entries[0]!.id : null;
    }

    const anchor: BranchAnchor = {
      branchAnchorId: `ba-${piSessionId}`,
      piSessionId,
      forkPointEntryId,
      firstChildEntryId,
    };

    return {
      scopeId: key.scopeId,
      sessionId: key.sessionId,
      piSessionId,
      anchor,
    };
  }

  /** Binds a live Pi session to a native Splyce session (invariant 1). */
  bind(key: SessionKey, pi: PiSessionView): AncestryNode {
    const piSessionId = pi.getSessionId();
    const kStr = this.keyStr(key);

    const existingKey = this.piToKey.get(piSessionId);
    if (
      existingKey &&
      (existingKey.scopeId !== key.scopeId ||
        existingKey.sessionId !== key.sessionId)
    ) {
      throw new SessionMapError(
        "SESSION_FOREIGN",
        `Pi session ${piSessionId} is already bound to (${existingKey.scopeId}, ${existingKey.sessionId})`,
      );
    }

    const existingPi = this.keyToPi.get(kStr);
    if (existingPi && existingPi !== piSessionId) {
      throw new SessionMapError(
        "SESSION_FOREIGN",
        `Session (${key.scopeId}, ${key.sessionId}) is already bound to Pi session ${existingPi}`,
      );
    }

    this.piToKey.set(piSessionId, key);
    this.keyToPi.set(kStr, piSessionId);
    this.piViews.set(piSessionId, pi);
    const file = pi.getSessionFile();
    if (file) {
      this.fileToPi.set(file, piSessionId);
    }

    return this.computeNode(key, pi);
  }

  /** The native key bound to a Pi session id. */
  resolve(piSessionId: string): SessionKey {
    const key = this.piToKey.get(piSessionId);
    if (!key) {
      throw new SessionMapError(
        "SESSION_UNKNOWN",
        `Pi session ${piSessionId} is not bound`,
      );
    }
    return key;
  }

  /** Pi-derived ancestry, leaf first (invariant 2). */
  ancestry(piSessionId: string): Ancestry {
    this.resolve(piSessionId);
    const chain: AncestryNode[] = [];
    let currentId: string | undefined = piSessionId;
    let complete = true;

    while (currentId) {
      const key: SessionKey | undefined = this.piToKey.get(currentId);
      if (!key) {
        complete = false;
        break;
      }
      const piView: PiSessionView | undefined = this.piViews.get(currentId);
      if (!piView) {
        complete = false;
        break;
      }
      const node: AncestryNode = this.computeNode(key, piView);
      chain.push(node);

      const parentFile: string | undefined = piView.getHeader()?.parentSession;
      if (!parentFile) {
        complete = true;
        break;
      }

      let parentPiId: string | undefined = this.fileToPi.get(parentFile);
      if (!parentPiId) {
        for (const [id, view] of this.piViews.entries()) {
          if (id === parentFile || view.getSessionFile() === parentFile) {
            parentPiId = id;
            break;
          }
        }
      }

      if (!parentPiId) {
        complete = false;
        break;
      }

      currentId = parentPiId;
    }

    return { chain, complete };
  }

  /** Durable, idempotent run anchor under the bound session (invariant 5). */
  anchorRun(piSessionId: string, run: RunAnchorInput): Appended {
    const key = this.resolve(piSessionId);
    const piView = this.piViews.get(piSessionId)!;
    const sessionAnchors = this.runAnchors.get(piSessionId);
    if (sessionAnchors?.has(run.runId)) {
      return sessionAnchors.get(run.runId)!;
    }

    const node = this.computeNode(key, piView);
    const record = {
      ...run,
      piSessionId,
      branchAnchorId: node.anchor.branchAnchorId,
      scopeId: key.scopeId,
      sessionId: key.sessionId,
      schemaVersion: 1,
    };

    const appended = this.store.append(
      { kind: "run", record },
      { ...this.context, sessionId: key.sessionId },
    );

    if (!this.runAnchors.has(piSessionId)) {
      this.runAnchors.set(piSessionId, new Map());
    }
    this.runAnchors.get(piSessionId)!.set(run.runId, appended);

    return appended;
  }

  /** The single channel for a bound session plus replay after afterSeq. */
  follow(key: SessionKey, afterSeq: number): FollowResult {
    const kStr = this.keyStr(key);
    if (!this.keyToPi.has(kStr)) {
      throw new SessionMapError(
        "SESSION_UNKNOWN",
        `Session (${key.scopeId}, ${key.sessionId}) is not bound`,
      );
    }

    const receipts = new Receipts(this.store);
    const baseContext: ContractContext = {
      scopeId: key.scopeId,
      sessionId: key.sessionId,
      configRevision: this.context.configRevision,
      profileRevision: this.context.profileRevision,
      policyRevision: this.context.policyRevision,
      lastDurableSeq: receipts.sessionDurableCursor(key.scopeId, key.sessionId),
      maxInlineBytes: TRANSPORT_LIMITS.maxInlineBytes,
      resolveReference: this.context.resolveReference ?? (() => true),
    };
    const bridge = new DesktopBridge(baseContext, receipts);
    const channel: SessionChannel = {
      scopeId: key.scopeId,
      sessionId: key.sessionId,
      receipts,
      bridge,
    };
    this.channels.set(kStr, channel);

    const replay = this.store.list(key.scopeId, afterSeq, key.sessionId);

    return { channel, replay };
  }

  /** Stamps native scope/session and submits to the followed bridge. */
  publish(piSessionId: string, event: EngineEvent): Frame | undefined {
    const key = this.resolve(piSessionId);
    if ("scopeId" in event || "sessionId" in event) {
      throw new SessionMapError(
        "SESSION_FOREIGN",
        "Engine event must not carry native scopeId or sessionId",
      );
    }

    const kStr = this.keyStr(key);
    const channel = this.channels.get(kStr);
    if (!channel) {
      throw new SessionMapError(
        "SESSION_NOT_FOLLOWED",
        `Session (${key.scopeId}, ${key.sessionId}) is not followed`,
      );
    }

    const fullEvent = {
      ...event,
      scopeId: key.scopeId,
      sessionId: key.sessionId,
    };

    return channel.bridge.submit(fullEvent);
  }

  /** Ends a session: binding and channel are dropped together. */
  dispose(key: SessionKey): void {
    const kStr = this.keyStr(key);
    const piSessionId = this.keyToPi.get(kStr);
    if (piSessionId) {
      this.keyToPi.delete(kStr);
      this.piToKey.delete(piSessionId);
      const pi = this.piViews.get(piSessionId);
      if (pi?.getSessionFile()) {
        this.fileToPi.delete(pi.getSessionFile()!);
      }
      this.piViews.delete(piSessionId);
      this.runAnchors.delete(piSessionId);
    }
    this.channels.delete(kStr);
  }
}
