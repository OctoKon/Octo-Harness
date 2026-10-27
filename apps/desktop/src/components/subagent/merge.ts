import type { EventPayloads } from "@splyce/pi/contracts";

/** Hard display/apply ceiling agreed for `subagent.diff` patches. */
export const SUBAGENT_PATCH_MAX_BYTES = 262_144;

export type SubagentFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "binary";

export interface SubagentDiffFile {
  readonly path: string;
  readonly status: SubagentFileStatus;
}

/** `subagent.diff` response for one child worktree. */
export interface SubagentDiff {
  readonly childId: string;
  readonly worktreeId: string;
  readonly files: readonly SubagentDiffFile[];
  readonly patch: string;
  readonly truncated: boolean;
  readonly bytes: number;
  readonly actionId: string;
  readonly argumentsDigest: string;
}

export interface SubagentCitation {
  readonly path: string;
  readonly line: number;
}

export interface SubagentBudget {
  readonly used: number;
  readonly limit: number;
}

/** The child fields the desktop receives with the diff/approval surface. */
export interface SubagentChild {
  readonly childId: string;
  readonly parentRunId: string;
  readonly team?: string;
  readonly role?: string;
  readonly status: string;
  readonly budget?: SubagentBudget;
  readonly summary?: string;
  readonly citations?: readonly SubagentCitation[];
}

/**
 * The engine approval for `worktree.apply:<worktreeId>`: the normal approval
 * payload plus the arguments digest it was issued for.
 */
export type SubagentApprovalRequest = EventPayloads["approval.requested"] & {
  readonly argumentsDigest: string;
};

export type SubagentApprovalDecision = "approve" | "deny";

export type SubagentApplyState =
  "idle" | "pending" | "applied" | "denied" | "failed";

export type ApplyGate =
  | { readonly allowed: true; readonly reason: null }
  | { readonly allowed: false; readonly reason: string };

function blocked(reason: string): ApplyGate {
  return { allowed: false, reason };
}

/**
 * Fail closed. Apply may only be requested for a complete diff of this child
 * and, once an engine approval exists, only for exactly that action and
 * arguments digest.
 */
export function applyGate(
  child: SubagentChild,
  diff: SubagentDiff | null,
  approval: SubagentApprovalRequest | null = null,
): ApplyGate {
  if (!diff) return blocked("No diff is loaded for this child.");
  if (diff.childId !== child.childId) {
    return blocked("The loaded diff belongs to a different child.");
  }
  if (diff.files.length === 0) {
    return blocked("The diff reports no changed files.");
  }
  if (diff.patch.trim().length === 0) {
    return blocked("The diff contains no patch text.");
  }
  if (diff.truncated) {
    return blocked(
      "The diff is truncated. Review the full change before applying.",
    );
  }
  if (approval) {
    if (approval.actionId !== diff.actionId) {
      return blocked(
        "The approval is for a different action than this diff. Apply is blocked.",
      );
    }
    if (approval.argumentsDigest !== diff.argumentsDigest) {
      return blocked(
        "The approval arguments digest does not match this diff. Apply is blocked.",
      );
    }
  }
  return { allowed: true, reason: null };
}

const FILE_STATUS_LABEL: Readonly<Record<SubagentFileStatus, string>> = {
  added: "Added",
  modified: "Modified",
  deleted: "Deleted",
  renamed: "Renamed",
  copied: "Copied",
  untracked: "Untracked",
  binary: "Binary",
};

export function fileStatusLabel(status: SubagentFileStatus): string {
  return FILE_STATUS_LABEL[status] ?? status;
}

/** The approval summary shown beside the prompt: file count plus digest. */
export function approvalArgsSummary(diff: SubagentDiff): string {
  const count = diff.files.length;
  return `${count} ${count === 1 ? "file" : "files"} · ${diff.argumentsDigest}`;
}
