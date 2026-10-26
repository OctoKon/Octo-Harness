<script lang="ts">
  /**
   * TD-30 approval surface (D3_approval_revision, FUI-W5).
   *
   * This is the engine-facing mount point for the approval dialog: it shows the
   * newest request the transport delivered and nothing else. An older request
   * never resurfaces when the newest one is dismissed - that would ask about a
   * target the engine has already moved past - and a request that is replaced
   * while the dialog is open remounts the dialog so no decision or "submitted"
   * state from the previous target can carry over.
   *
   * The surface causes no effect itself: ApprovalDialog validates against the
   * reconciliation context and only hands back the store-built payload.
   */
  import ApprovalDialog from "./ApprovalDialog.svelte";
  import {
    activeApproval,
    type ApprovalContext,
    type ApprovalRequestView,
    type ApprovalResponsePayload,
  } from "../stores/approvals";

  interface Props {
    /** Delivered requests, in arrival order. */
    requests: readonly ApprovalRequestView[];
    context: ApprovalContext;
    onRespond?: (payload: ApprovalResponsePayload) => void;
    /** Dismissal of the newest request; older requests stay closed too. */
    onDismiss?: (approvalRequestId: string) => void;
  }

  let { requests, context, onRespond = () => {}, onDismiss = () => {} }: Props =
    $props();

  const active = $derived(activeApproval(requests));
  let dismissed: string | null = $state(null);

  const visible = $derived(
    active && active.request.approvalRequestId !== dismissed ? active : null,
  );

  function dismiss() {
    if (active) dismissed = active.request.approvalRequestId;
    onDismiss(active?.request.approvalRequestId ?? "");
  }
</script>

{#if visible}
  {#key visible.request.approvalRequestId}
    <ApprovalDialog
      request={visible}
      {context}
      {onRespond}
      onDismiss={dismiss}
    />
  {/key}
{/if}
