<script lang="ts">
  import { tick } from "svelte";
  import ApprovalCard from "../ApprovalCard.svelte";
  import { redactToolText, toolErrorCopy } from "../../tool-view";
  import DiffView from "../diff/DiffView.svelte";
  import {
    SUBAGENT_PATCH_MAX_BYTES,
    applyGate,
    approvalArgsSummary,
    fileStatusLabel,
    type SubagentApplyState,
    type SubagentApprovalDecision,
    type SubagentApprovalRequest,
    type SubagentChild,
    type SubagentDiff,
  } from "./merge";

  let {
    child,
    diff = null,
    approval = null,
    loading = false,
    error = null,
    applyState = "idle",
    onRequestDiff,
    onApply,
    onDiscard,
    onApproval,
  }: {
    child: SubagentChild;
    diff?: SubagentDiff | null;
    approval?: SubagentApprovalRequest | null;
    loading?: boolean;
    error?: string | null;
    applyState?: SubagentApplyState;
    onRequestDiff: () => void;
    onApply: (diff: SubagentDiff) => void;
    onDiscard: (childId: string) => void;
    onApproval: (decision: SubagentApprovalDecision) => void;
  } = $props();

  let requestedActionId = $state<string | null>(null);
  let discardOpen = $state(false);
  let discardRequested = $state(false);
  let decision = $state<SubagentApprovalDecision | null>(null);
  let decidedFor = $state<string | null>(null);
  let keepButton = $state<HTMLButtonElement | null>(null);
  let discardButton = $state<HTMLButtonElement | null>(null);
  let seenApprovalId: string | null = null;

  const gate = $derived(applyGate(child, diff, approval));
  const requested = $derived(
    diff !== null && requestedActionId === diff.actionId,
  );
  const approvalMatches = $derived(
    gate.allowed && diff !== null && approval !== null,
  );
  const argsSummary = $derived(diff ? redactToolText(approvalArgsSummary(diff)) : "");
  const activeDecision = $derived(
    approval !== null && decidedFor === approval.approvalRequestId
      ? decision
      : null,
  );
  const blockedReason = $derived(gate.allowed ? null : gate.reason);
  const summaryText = $derived(child.summary ? redactToolText(child.summary) : null);
  const errorText = $derived(error ? toolErrorCopy(error).copy : null);
  const applyDisabled = $derived(
    !gate.allowed ||
      requested ||
      approval !== null ||
      applyState === "pending" ||
      applyState === "applied",
  );
  const discardDisabled = $derived(
    discardRequested ||
      requested ||
      approvalMatches ||
      applyState === "pending" ||
      applyState === "applied",
  );
  const applyTitle = $derived(
    !gate.allowed
      ? gate.reason
      : requested
        ? "Apply was already requested."
        : approval
          ? "Respond to the approval prompt instead."
          : applyState === "pending" || applyState === "applied"
            ? "Waiting for the engine."
            : undefined,
  );

  const engineStatus = $derived(
    applyState === "applied"
      ? "Engine acknowledged: the worktree changes were applied."
      : applyState === "pending"
        ? "Apply requested; waiting for engine acknowledgement."
        : applyState === "denied"
          ? "Engine reported the apply was denied; the worktree is unchanged."
          : applyState === "failed"
            ? "Engine reported the apply failed; the worktree may be unchanged."
            : null,
  );
  const localStatus = $derived(
    discardRequested
      ? "Discard requested; waiting for the engine."
      : decision === "approve"
        ? "Approval submitted. Waiting for the engine to confirm the apply."
        : decision === "deny"
          ? "Apply denied. The worktree is unchanged."
          : requested
            ? "Apply requested. Waiting for the engine's approval request."
            : null,
  );
  const statusText = $derived(engineStatus ?? localStatus);

  // A different approval belongs to a new decision; never carry one over.
  $effect(() => {
    const id = approval?.approvalRequestId ?? null;
    if (id !== null && id !== seenApprovalId) {
      seenApprovalId = id;
      decidedFor = null;
      decision = null;
    }
  });

  // Opening the inline confirmation focuses its non-destructive default.
  $effect(() => {
    if (discardOpen) keepButton?.focus();
  });

  function requestApply(): void {
    if (
      !diff ||
      !gate.allowed ||
      requestedActionId === diff.actionId ||
      approval !== null ||
      applyState === "pending" ||
      applyState === "applied"
    ) {
      return;
    }
    requestedActionId = diff.actionId;
    onApply(diff);
  }

  function respond(next: SubagentApprovalDecision): void {
    if (!approval || !approvalMatches || activeDecision !== null) return;
    decidedFor = approval.approvalRequestId;
    decision = next;
    onApproval(next);
  }

  function openDiscard(): void {
    if (discardOpen || discardDisabled) return;
    discardOpen = true;
  }

  function cancelDiscard(): void {
    discardOpen = false;
    void tick().then(() => discardButton?.focus());
  }

  function confirmDiscard(): void {
    discardOpen = false;
    discardRequested = true;
    onDiscard(child.childId);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.isContentEditable) return;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      ) {
        return;
      }
    }

    if (event.key === "Escape") {
      if (discardOpen) {
        event.preventDefault();
        cancelDiscard();
      } else if (approvalMatches && activeDecision === null) {
        event.preventDefault();
        respond("deny");
      }
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "a") {
      event.preventDefault();
      requestApply();
    } else if (key === "d") {
      event.preventDefault();
      openDiscard();
    } else if (key === "y" && approvalMatches && activeDecision === null) {
      event.preventDefault();
      respond("approve");
    } else if (key === "n" && approvalMatches && activeDecision === null) {
      event.preventDefault();
      respond("deny");
    }
  }

  function focusDeny(node: HTMLElement): void {
    node
      .querySelector<HTMLButtonElement>('[data-testid="approval-deny-button"]')
      ?.focus();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section
  class="subagent-merge"
  aria-labelledby="subagent-merge-title"
  data-testid="subagent-merge"
>
  <header class="child">
    <h3 id="subagent-merge-title">Subagent merge-back</h3>
    <dl class="facts">
      <dt>Child</dt>
      <dd data-testid="subagent-child-id">{child.childId}</dd>
      {#if child.team}
        <dt>Team</dt>
        <dd data-testid="subagent-team">{child.team}</dd>
      {/if}
      {#if child.role}
        <dt>Role</dt>
        <dd data-testid="subagent-role">{child.role}</dd>
      {/if}
      <dt>Status</dt>
      <dd data-testid="subagent-child-status">{child.status}</dd>
      <dt>Parent run</dt>
      <dd>{child.parentRunId}</dd>
    </dl>
    {#if summaryText}
      <p class="summary" data-testid="subagent-summary">{summaryText}</p>
    {/if}
    {#if child.citations && child.citations.length > 0}
      <div class="citations">
        <h4>Citations</h4>
        <ul>
          {#each child.citations as citation, index (index)}
            <li data-testid="subagent-citation">
              <code
                >{citation.path}{#if citation.line > 0}:{citation.line}{/if}</code
              >
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </header>

  <section class="changes" aria-label="Child changes">
    <h4>Changed files</h4>
    {#if loading}
      <p role="status" data-testid="subagent-loading">Loading the child diff…</p>
    {:else if error}
      <p class="error" role="alert" data-testid="subagent-error">{errorText}</p>
      <button type="button" onclick={onRequestDiff} data-testid="subagent-load-diff"
        >Retry loading diff</button
      >
    {:else if !diff}
      <p role="status" data-testid="subagent-no-diff">
        No diff is loaded for this child. Nothing can be applied.
      </p>
      <button type="button" onclick={onRequestDiff} data-testid="subagent-load-diff"
        >Load diff</button
      >
    {:else}
      {#if diff.files.length === 0}
        <p role="status" data-testid="subagent-empty">
          The diff reports no changed files.
        </p>
      {:else}
        <ul class="files" aria-label="{diff.files.length} changed files">
          {#each diff.files as file, index (`${file.path}:${index}`)}
            <li class="file" data-testid="subagent-file">
              <code class="path">{file.path}</code>
              <span class="file-status" data-status={file.status}
                >{fileStatusLabel(file.status)}</span
              >
            </li>
          {/each}
        </ul>
      {/if}

      {#if diff.truncated}
        <p class="warning" role="alert" data-testid="subagent-truncated">
          The patch is truncated ({diff.bytes} bytes received). Only part of the
          change is shown; Apply is blocked until the full diff is reviewed.
        </p>
      {/if}

      <DiffView diff={diff.patch} maxBytes={SUBAGENT_PATCH_MAX_BYTES} />
    {/if}
  </section>

  <section class="actions" aria-label="Merge actions">
    <div class="buttons">
      <button
        type="button"
        data-testid="subagent-apply"
        disabled={applyDisabled}
        title={applyTitle}
        aria-describedby={blockedReason && diff
          ? "subagent-apply-reason"
          : undefined}
        onclick={requestApply}>Apply</button
      >
      <button
        type="button"
        bind:this={discardButton}
        data-testid="subagent-discard"
        disabled={discardDisabled}
        onclick={openDiscard}>Discard</button
      >
    </div>

    {#if blockedReason && diff}
      <p
        class="blocked"
        id="subagent-apply-reason"
        role="status"
        data-testid="subagent-apply-reason">{blockedReason}</p
      >
    {/if}

    {#if discardOpen}
      <div
        class="confirm"
        role="group"
        aria-labelledby="subagent-discard-title"
        data-testid="subagent-discard-confirm"
      >
        <p id="subagent-discard-title">
          Discard the worktree for {child.childId}? Its unapplied changes are
          removed and this cannot be undone.
        </p>
        <div class="buttons">
          <button
            type="button"
            bind:this={keepButton}
            data-testid="subagent-keep"
            onclick={cancelDiscard}>Keep worktree</button
          >
          <button
            type="button"
            class="danger"
            data-testid="subagent-discard-confirm-button"
            onclick={confirmDiscard}>Discard worktree</button
          >
        </div>
      </div>
    {/if}
  </section>

  {#if diff && approval && approvalMatches}
    <section class="approval" aria-label="Worktree apply approval">
      <p class="approval-args" data-testid="subagent-approval-args">
        Target <code>{redactToolText(diff.actionId)}</code> - Arguments
        <code>{argsSummary}</code>
      </p>
      <div use:focusDeny>
        <ApprovalCard
          request={approval}
          decision={activeDecision}
          onRespond={respond}
        />
      </div>
    </section>
  {:else if approval}
    <p class="warning" role="alert" data-testid="subagent-approval-mismatch">
      This approval cannot be used for this diff:
      {gate.reason ?? "the approval does not match the loaded diff."}
    </p>
  {/if}

  {#if statusText}
    <p class="status" role="status" data-testid="subagent-merge-status">
      {statusText}
    </p>
  {/if}
</section>

<style>
  .subagent-merge {
    display: flex;
    flex-direction: column;
    gap: var(--splyce-space-3, 0.75rem);
    padding: var(--splyce-space-3, 0.75rem);
    border: 1px solid var(--splyce-border-default, #e5e7eb);
    border-radius: var(--splyce-space-2, 0.5rem);
    background: var(--splyce-surface-raised, #ffffff);
    color: var(--splyce-text-primary, #111827);
    overflow-wrap: anywhere;
  }
  h3,
  h4 {
    margin: 0;
  }
  .facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--splyce-space-1, 0.25rem) var(--splyce-space-3, 0.75rem);
    margin: var(--splyce-space-2, 0.5rem) 0;
    font-size: var(--splyce-font-size-sm, 0.875rem);
  }
  .facts dt {
    color: var(--splyce-text-muted, #6b7280);
  }
  .facts dd {
    margin: 0;
    font-family: var(--splyce-font-family-mono, Consolas, monospace);
  }
  .summary {
    margin: 0;
    color: var(--splyce-text-secondary, #4b5563);
    font-size: var(--splyce-font-size-sm, 0.875rem);
  }
  .citations {
    margin-top: var(--splyce-space-2, 0.5rem);
  }
  .citations h4 {
    font-size: var(--splyce-font-size-xs, 0.75rem);
    color: var(--splyce-text-muted, #6b7280);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .citations ul {
    margin: var(--splyce-space-1, 0.25rem) 0 0;
    padding-inline-start: var(--splyce-space-4, 1rem);
  }
  .changes {
    display: flex;
    flex-direction: column;
    gap: var(--splyce-space-2, 0.5rem);
  }
  .files {
    display: flex;
    flex-direction: column;
    gap: var(--splyce-space-1, 0.25rem);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .file {
    display: flex;
    flex-wrap: wrap;
    gap: var(--splyce-space-2, 0.5rem);
    align-items: baseline;
    font-size: var(--splyce-font-size-sm, 0.875rem);
  }
  .path,
  .approval-args code {
    font-family: var(--splyce-font-family-mono, Consolas, monospace);
  }
  .file-status {
    color: var(--splyce-text-muted, #6b7280);
    font-size: var(--splyce-font-size-xs, 0.75rem);
    border: 1px solid var(--splyce-border-default, #e5e7eb);
    border-radius: 999px;
    padding: 0 var(--splyce-space-2, 0.5rem);
  }
  .file-status[data-status="added"],
  .file-status[data-status="untracked"] {
    color: var(--splyce-status-success, #047857);
    border-color: var(--splyce-status-success, #047857);
  }
  .file-status[data-status="deleted"] {
    color: var(--splyce-status-danger, #b91c1c);
    border-color: var(--splyce-status-danger, #b91c1c);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--splyce-space-2, 0.5rem);
  }
  button {
    font: inherit;
    padding: var(--splyce-space-1, 0.25rem) var(--splyce-space-3, 0.75rem);
    border: 1px solid var(--splyce-border-default, #e5e7eb);
    border-radius: 4px;
    background: var(--splyce-surface-default, #ffffff);
    color: inherit;
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  button:focus-visible {
    outline: 2px solid var(--splyce-focus-ring, #2563eb);
    outline-offset: var(--splyce-focus-offset, 2px);
  }
  .danger {
    color: var(--splyce-status-danger, #b91c1c);
    border-color: var(--splyce-status-danger, #b91c1c);
  }
  .confirm,
  .approval {
    display: flex;
    flex-direction: column;
    gap: var(--splyce-space-2, 0.5rem);
    padding: var(--splyce-space-2, 0.5rem);
    border: 1px solid var(--splyce-status-warning, #b45309);
    border-radius: 4px;
  }
  .confirm p,
  .approval-args {
    margin: 0;
    font-size: var(--splyce-font-size-sm, 0.875rem);
  }
  .blocked,
  .warning,
  .error {
    margin: 0;
    color: var(--splyce-status-danger, #b91c1c);
    font-size: var(--splyce-font-size-sm, 0.875rem);
  }
  .status {
    margin: 0;
    color: var(--splyce-text-secondary, #4b5563);
    font-size: var(--splyce-font-size-sm, 0.875rem);
  }
  .approval :global(.btn-approve:focus-visible),
  .approval :global(.btn-deny:focus-visible) {
    outline: 2px solid var(--splyce-focus-ring, #2563eb);
    outline-offset: var(--splyce-focus-offset, 2px);
  }
</style>
