<script lang="ts">
  import { onMount } from "svelte";
  import SubagentMerge from "../../src/components/subagent/SubagentMerge.svelte";
  import type {
    SubagentApprovalRequest,
    SubagentChild,
    SubagentDiff,
  } from "../../src/components/subagent/merge";
  import fixture from "./merge-fixture.json";

  const child = fixture.child as SubagentChild;
  const baseDiff = fixture.diff as SubagentDiff;
  const approvalRequest = fixture.approval as SubagentApprovalRequest;

  let diff = $state<SubagentDiff | null>(baseDiff);
  let approval = $state<SubagentApprovalRequest | null>(null);
  let error: string | null = $state(null);
  let applied: string[] = [];
  let discarded: string[] = [];
  let decisions: string[] = [];
  let diffRequests = 0;

  function scenario(name: string): void {
    diff = baseDiff;
    approval = null;
    error = null;
    if (name === "approval") {
      approval = approvalRequest;
    } else if (name === "mismatch") {
      approval = {
        ...approvalRequest,
        argumentsDigest: "sha256:not-the-same",
      };
    } else if (name === "truncated") {
      diff = { ...baseDiff, truncated: true };
    } else if (name === "error") {
      diff = null;
      error = "IO_ERROR: C:\\private\\worktree";
    }
  }

  onMount(() => {
    window.__subagent = {
      scenario,
      calls: () => ({
        applied: [...applied],
        discarded: [...discarded],
        decisions: [...decisions],
        diffRequests,
      }),
    };
  });
</script>

<SubagentMerge
  {child}
  {diff}
  {approval}
  {error}
  onRequestDiff={() => {
    diffRequests += 1;
  }}
  onApply={(next) => {
    applied.push(next.actionId);
  }}
  onDiscard={(childId) => {
    discarded.push(childId);
  }}
  onApproval={(decision) => {
    decisions.push(decision);
  }}
/>
