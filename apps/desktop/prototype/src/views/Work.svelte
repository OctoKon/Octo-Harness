<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { workspaces } from '../lib/data';
  import Composer from '../lib/Composer.svelte';
  import Picker from '../lib/Picker.svelte';
  import Icon from '../lib/Icon.svelte';

  let prompt = $state('');
  let base = $state('main');
  let model = $state('Qwen3-Coder-30B-A3B');
  const recents = $derived(app.runs.slice(0, 3));

  function start(text: string) {
    app.createRun(text, app.workspaceId, `${base}@a3f91c2`, model);
    prompt = '';
    app.toast('Run created · approvals stay on');
  }
</script>

<div class="page work-page">
  <div class="work-stage">
    <h1 class="work-motto">
      Barebones by default.<br />
      Modular by choice.<br />
      <em>Evidence by design.</em>
    </h1>

    <Composer
      bind:value={prompt}
      placeholder="Describe the task, the acceptance test, and anything that must not change…"
      onsend={start}
    >
      <Picker
        label="workspace"
        icon="folder"
        value={app.workspaceId}
        options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
        onchange={(value) => app.setWorkspace(value)}
      />
      <Picker
        label="base"
        icon="branch"
        value={base}
        options={[
          { value: 'main', label: 'main', note: 'a3f91c2' },
          { value: 'release/1.4', label: 'release/1.4', note: 'b81d003' },
          { value: 'splyce/retry-loop', label: 'splyce/retry-loop', note: 'unverified' },
        ]}
        onchange={(value) => (base = value)}
      />
      <Picker
        label="runtime"
        icon="cpu"
        value={model}
        options={[
          { value: 'Qwen3-Coder-30B-A3B', label: 'Pi · Qwen3-Coder' },
          { value: 'Devstral-Small-24B', label: 'Pi · Devstral' },
        ]}
        onchange={(value) => (model = value)}
      />
      <span class="spacer"></span>
      <span class="muted t-micro">Enter to start · Shift+Enter for a line</span>
    </Composer>

    <section class="work-recents" aria-labelledby="recents-label">
      <h2 class="recents-label" id="recents-label">Recents</h2>
      {#each recents as run (run.id)}
        <button class="recent-row" type="button" onclick={() => app.openRun(run.id)}>
          <span class="recent-status" data-status={run.status} aria-hidden="true"></span>
          <span class="recent-copy">
            <span class="recent-title">{run.title}</span>
            <span class="recent-meta">{run.workspace} · {run.updated}</span>
          </span>
          <span class="recent-arrow"><Icon name="arrow-right" size={13} /></span>
        </button>
      {/each}
    </section>

    <div class="work-hint">
      <span><Icon name="shield" size={11} /> Policy checked before dispatch</span>
      <span><Icon name="lock" size={11} /> Local only · no cloud fallback</span>
    </div>
  </div>
</div>

<style>
  .work-page {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .work-stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-bottom: 6vh;
  }
  .work-motto {
    max-width: 720px;
    margin: 0 auto 28px;
    font-family: var(--serif);
    font-size: clamp(32px, 4.2vw, 56px);
    font-weight: 400;
    line-height: 1.06;
    letter-spacing: -0.018em;
    text-align: center;
    transform: translateY(-30px);
  }
  .work-motto em {
    font-style: italic;
  }
  .work-recents {
    width: min(100%, 720px);
    margin: 0 auto;
    border: 1px solid var(--border);
    border-radius: var(--r-xl);
    background: var(--neutral);
    overflow: hidden;
  }
  .recents-label {
    margin: 0;
    padding: 12px 15px 9px;
    font-size: 10px;
    font-weight: 500;
    line-height: 14px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .recent-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 15px;
    border-top: 1px solid var(--border);
    text-align: left;
    transition: background 0.15s;
  }
  .recent-row:hover {
    background: var(--surface);
  }
  .recent-row:focus-visible {
    /* keep the ring inside the card, whose overflow clips outside outlines */
    outline-offset: -3px;
    border-radius: var(--r-sm);
  }
  .recent-status {
    width: 6px;
    height: 6px;
    border-radius: var(--r-full);
    background: var(--dot-idle);
    flex: none;
  }
  .recent-status[data-status='approval'] {
    background: var(--error);
  }
  .recent-status[data-status='running'] {
    background: var(--primary);
  }
  .recent-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .recent-title {
    overflow: hidden;
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
    color: var(--on-surface);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .recent-meta {
    overflow: hidden;
    font-size: 11px;
    line-height: 14px;
    color: var(--text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .recent-arrow {
    display: grid;
    place-items: center;
    color: var(--text-faint);
    flex: none;
  }
  .recent-row:hover .recent-arrow {
    color: var(--on-surface);
  }
  .work-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    flex-wrap: wrap;
    padding: 10px 2px 0;
    font-size: 11px;
    color: var(--text-faint);
  }
  .work-hint span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  @media (min-width: 821px) {
    .work-stage {
      padding-top: 6vh;
      padding-bottom: 0;
    }
  }
</style>
