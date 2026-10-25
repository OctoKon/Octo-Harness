<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Run } from './types';
  import Icon from './Icon.svelte';
  import Chip from './Chip.svelte';

  let {
    run,
    onresolve,
  }: {
    run: Run;
    onresolve: (decision: 'allowed' | 'always' | 'denied') => void;
  } = $props();

  const verdict = $derived(
    run.approval === 'denied'
      ? 'Denied by you'
      : run.approval === 'always'
        ? 'Always allowed for this workspace'
        : 'Allowed once',
  );
</script>

<div class="approval" class:resolved={!!run.approval}>
  <div class="a-body">
    <div class="a-top">
      <div style="flex:1;min-width:0">
        {#if !run.approval}
          <Chip tone="err" dot>Waiting for approval</Chip>
        {:else if run.approval === 'denied'}
          <Chip tone="outline" dot>Denied · no effect</Chip>
        {:else}
          <Chip tone="outline" dot>Approved · effect recorded</Chip>
        {/if}
        <h3 style="margin-top:10px">Apply changes to {run.workspace}</h3>
        <p class="a-desc">
          {#if run.approval === 'denied'}
            No bytes were written. The diff and verification receipt are retained on the run.
          {:else if run.approval}
            The effect is scoped to <strong>{run.branch}</strong>. The verification receipt stays
            bound to the final revision.
          {:else}
            This run verified at base <strong>{run.base}</strong>. Applying writes {run.files} files and
            stays inside <strong>{run.branch}</strong>.
          {/if}
        </p>
      </div>
      <span class="l-ico" style="margin:0;flex:none">
        <Icon name="shield" size={16} />
      </span>
    </div>

    <dl class="a-kv">
      <dt>Capability</dt>
      <dd>workspace.apply</dd>
      <dt>Scope</dt>
      <dd>{run.workspace} / {run.branch}</dd>
      <dt>Base revision</dt>
      <dd>{run.base}</dd>
      <dt>Verification</dt>
      <dd>{run.verification?.command ?? 'not recorded'} · exit {run.verification?.exit ?? '—'}</dd>
    </dl>

    {#if !run.approval}
      <div class="a-actions">
        <button type="button" class="btn primary" onclick={() => onresolve('allowed')}
          >Allow once</button
        >
        <button type="button" class="btn secondary" onclick={() => onresolve('always')}>
          Always allow for this workspace
        </button>
        <button type="button" class="btn ghost" onclick={() => onresolve('denied')}>Deny</button>
      </div>
    {:else}
      <div class="a-verdict" transition:fade={{ duration: 160 }}>
        <Icon name={run.approval === 'denied' ? 'x' : 'check'} size={13} stroke={2.2} />
        <b>{verdict}</b>
        <span>· receipt rc-8842</span>
        {#if run.approval !== 'denied'}
          <span style="margin-left:auto">applied</span>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .approval {
    border-color: var(--border);
  }
  .approval:not(.resolved) {
    border-color: var(--error-border);
  }
  .approval .a-desc strong {
    color: var(--on-surface);
    font-weight: 500;
  }
  .approval .a-actions {
    flex-wrap: wrap;
  }
</style>
