<script lang="ts">
  import { app } from '../lib/state.svelte';
  import PageHead from '../lib/PageHead.svelte';
  import Picker from '../lib/Picker.svelte';
  import Icon from '../lib/Icon.svelte';
  import Chip from '../lib/Chip.svelte';
  import StatusChip from '../lib/StatusChip.svelte';
  import type { RunStatus } from '../lib/types';

  let query = $state('');
  let filter = $state<'all' | RunStatus>('all');
  let sort = $state<'newest' | 'oldest'>('newest');

  const counts = $derived.by(() => {
    const c = { all: app.runs.length, approval: 0, running: 0, verified: 0, stopped: 0 };
    for (const run of app.runs) {
      if (run.status === 'approval' && run.approval) continue;
      c[run.status] += 1;
    }
    return c;
  });

  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    const list = app.runs.filter((run) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'approval'
          ? run.status === 'approval' && !run.approval
          : run.status === filter);
      const matchesQuery =
        !needle ||
        run.title.toLowerCase().includes(needle) ||
        run.workspace.toLowerCase().includes(needle) ||
        run.id.includes(needle);
      return matchesFilter && matchesQuery;
    });
    return sort === 'newest' ? list : [...list].reverse();
  });

  function newRun() {
    app.go('work');
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus(),
      ),
    );
  }
</script>

<div class="page">
  <PageHead
    eyebrow="Local history · all workspaces"
    title="Runs"
    sub="Every run keeps its branch, base revision, stop reason and receipts. Nothing here leaves this machine."
  >
    <div class="search">
      <span class="search-ico"><Icon name="search" size={13} /></span>
      <input bind:value={query} placeholder="Search runs…" aria-label="Search runs" />
    </div>
    <button class="btn primary" type="button" onclick={newRun}>
      <Icon name="plus" size={13} /> New run
    </button>
  </PageHead>

  <div class="filters">
    {#each [['all', 'All'], ['approval', 'Needs approval'], ['running', 'Running'], ['verified', 'Verified'], ['stopped', 'Stopped']] as [value, label] (value)}
      <button
        class="filter"
        class:on={filter === value}
        type="button"
        onclick={() => (filter = value as 'all' | RunStatus)}
      >
        {label} <span class="n">{counts[value as keyof typeof counts]}</span>
      </button>
    {/each}
    <span class="spacer"></span>
    <Picker
      label="Sort"
      icon="sort"
      align="right"
      value={sort}
      options={[
        { value: 'newest', label: 'Newest first' },
        { value: 'oldest', label: 'Oldest first' },
      ]}
      onchange={(value) => (sort = value as 'newest' | 'oldest')}
    />
  </div>

  {#if filtered.length === 0}
    <div class="empty">
      No runs match{query ? ` “${query}”` : ' this filter'}.
      <button
        class="btn link"
        type="button"
        style="margin-left:6px"
        onclick={() => {
          query = '';
          filter = 'all';
        }}
      >
        Clear
      </button>
    </div>
  {:else}
    <div class="grid">
      {#each filtered as run (run.id)}
        <button class="card" type="button" onclick={() => app.openRun(run.id)}>
          <div class="c-top">
            <span class="tag">{run.workspace}</span>
            {#if run.status === 'approval' && run.approval}
              <Chip tone="outline" dot>{run.approval === 'denied' ? 'Denied' : 'Approved'}</Chip>
            {:else}
              <StatusChip status={run.status} />
            {/if}
          </div>
          <h3>{run.title}</h3>
          <div class="meta">
            <span class="mono">{run.id}</span>
            <span class="sep">·</span>
            <span>{run.files} files</span>
            <span class="sep">·</span>
            <span>{run.updated}</span>
            <span class="card-arrow"><Icon name="arrow-right" size={13} /></span>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
