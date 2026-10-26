<script lang="ts">
  import { onDestroy } from 'svelte';
  import { slide } from 'svelte/transition';
  import { app } from '../lib/state.svelte';
  import { localModels, roles as seedRoles } from '../lib/data';
  import type { LocalModel, Role } from '../lib/types';
  import PageHead from '../lib/PageHead.svelte';
  import Icon from '../lib/Icon.svelte';
  import Chip from '../lib/Chip.svelte';
  import Picker from '../lib/Picker.svelte';

  const roleIcon = {
    generation: 'spark',
    extraction: 'file',
    embeddings: 'database',
    reranking: 'layers',
  } as const;

  let roleList = $state<Role[]>(seedRoles.map((role) => ({ ...role })));
  let catalog = $state<LocalModel[]>(localModels.map((model) => ({ ...model })));
  let checking = $state(false);
  let adding = $state(false);
  let newName = $state('');
  let newRuntime = $state('llama.cpp');
  let formError = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });

  const readyCount = $derived(roleList.filter((role) => role.locality === 'verified').length);

  function checkLocality() {
    if (checking) return;
    checking = true;
    timer = setTimeout(() => {
      roleList = roleList.map((role) => ({ ...role, locality: 'verified' }));
      checking = false;
      app.toast('4/4 local endpoints verified · no egress');
    }, 1300);
  }

  function toggleLoad(role: Role) {
    const next = role.state === 'loaded' ? 'ready' : 'loaded';
    roleList = roleList.map((entry) => (entry.id === role.id ? { ...entry, state: next } : entry));
    app.toast(
      `${role.label} · ${next === 'loaded' ? 'model loaded' : 'model unloaded, memory released'}`,
    );
  }

  function swap(role: Role, model: string) {
    roleList = roleList.map((entry) =>
      entry.id === role.id ? { ...entry, model, state: 'ready' } : entry,
    );
    app.toast(`${role.label} → ${model}`);
  }

  function addLocal() {
    if (!newName.trim()) {
      formError = 'Enter a model name or local file path.';
      return;
    }
    const name = newName.trim();
    catalog = [
      {
        id: `local-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        params: 'local',
        quant: '—',
        size: 'local file',
        runtime: newRuntime,
        roles: ['generation'],
        installed: true,
      },
      ...catalog,
    ];
    adding = false;
    newName = '';
    formError = '';
    app.toast('Model imported from local storage');
  }

  function install(model: LocalModel) {
    catalog = catalog.map((entry) =>
      entry.id === model.id ? { ...entry, installed: true } : entry,
    );
    app.toast(`${model.name} added to the local cache`);
  }

  function remove(model: LocalModel) {
    if (roleList.some((role) => role.model === model.name)) {
      app.toast('Unassign the model from its role first');
      return;
    }
    catalog = catalog.filter((entry) => entry.id !== model.id);
    app.toast(`${model.name} removed from the local cache`);
  }
</script>

<div class="page">
  <PageHead
    eyebrow="Local inference · no hosted fallback"
    title="Models"
    sub="Four roles, all executed on this machine. Model revision, locality and usage stay attached to every receipt."
  >
    <button class="btn secondary" type="button" onclick={checkLocality} disabled={checking}>
      <Icon name="refresh" size={13} />
      {checking ? 'Checking…' : 'Check locality'}
    </button>
    <button class="btn primary" type="button" onclick={() => (adding = !adding)}>
      <Icon name="plus" size={13} /> Add model
    </button>
  </PageHead>

  <div class="local-banner">
    <span class="l-ico" style="margin:0;flex:none"><Icon name="shield" size={16} /></span>
    <div class="lb-main">
      <div class="lb-title">Local-only profile</div>
      <div class="lb-sub">
        No role can fall back to a cloud endpoint. Endpoint identity and redirects are validated
        before dispatch.
      </div>
    </div>
    <Chip tone="outline" dot>{checking ? 'Verifying…' : `Verified ${readyCount}/4`}</Chip>
  </div>

  {#if adding}
    <div class="auto-form" style="margin-bottom:var(--gutter)" transition:slide={{ duration: 160 }}>
      <h3>Import a local model</h3>
      <div class="form-grid">
        <div class="field">
          <label for="model-name">Model name or local file</label>
          <input
            id="model-name"
            bind:value={newName}
            placeholder="e.g. devstral-small-24b-q4.gguf"
          />
        </div>
        <div class="field">
          <label for="model-runtime">Runtime</label>
          <select id="model-runtime" class="select" bind:value={newRuntime}>
            <option>llama.cpp</option>
            <option>ONNX</option>
            <option>MLX</option>
          </select>
        </div>
      </div>
      {#if formError}<p class="form-error">{formError}</p>{/if}
      <div class="form-actions">
        <button class="btn primary sm" type="button" onclick={addLocal}
          >Add from local storage</button
        >
        <button
          class="btn ghost sm"
          type="button"
          onclick={() => {
            adding = false;
            formError = '';
          }}>Cancel</button
        >
        <span class="muted t-micro" style="margin-left:auto"
          >No network request · weights hash verified on import</span
        >
      </div>
    </div>
  {/if}

  <div class="section-label">
    Model roles <span class="line"></span><span class="count">4 local</span>
  </div>
  <div class="panel">
    {#each roleList as role (role.id)}
      <div class="role-row">
        <div>
          <div class="role-name"><Icon name={roleIcon[role.id]} size={14} /> {role.label}</div>
          <div class="role-job">{role.job}</div>
        </div>
        <div>
          <div class="role-model-name">{role.model}</div>
          <div class="role-model-meta">{role.runtime} · {role.detail}</div>
        </div>
        <div class="role-right">
          <Chip tone={role.state === 'loaded' ? 'ink' : 'outline'} dot
            >{role.state === 'loaded' ? 'Loaded' : role.state === 'ready' ? 'Ready' : 'Idle'}</Chip
          >
          <button class="btn ghost sm" type="button" onclick={() => toggleLoad(role)}>
            {role.state === 'loaded' ? 'Unload' : 'Load'}
          </button>
          <Picker
            align="right"
            trigger="Swap"
            icon="refresh"
            value={role.model}
            options={catalog
              .filter((model) => model.installed && model.roles.includes(role.id))
              .map((model) => ({ value: model.name, label: model.name, note: model.size }))}
            onchange={(value) => swap(role, value)}
          />
        </div>
      </div>
    {/each}
  </div>
  <p class="set-note">
    Loading a model outside the run window is still a local effect. Unload releases VRAM without
    touching receipts.
  </p>

  <div class="grid-2" style="margin-top:32px">
    <div class="side-card">
      <h4>Hardware</h4>
      <div class="kv"><span class="k">GPU</span><span class="v">RTX 4090 · 24 GB</span></div>
      <div class="kv"><span class="k">System RAM</span><span class="v">64 GB</span></div>
      <div class="kv"><span class="k">CPU</span><span class="v">i9 · 24 cores</span></div>
      <div class="hw-use"><b>14.6</b> of 24 GB VRAM in use</div>
      <div class="meter thin"><i style="width:61%"></i></div>
      <div class="kv" style="border-top:0">
        <span class="k">Cold start</span><span class="v">2.4s</span>
      </div>
      <div class="kv"><span class="k">Idle RSS</span><span class="v">1.8 GB</span></div>
      <button
        class="btn secondary sm"
        type="button"
        style="width:100%;margin-top:10px"
        onclick={() => app.toast('Hardware profile re-measured · same supported envelope')}
      >
        Re-measure profile
      </button>
    </div>

    <div class="side-card">
      <h4>Embedding index</h4>
      <div class="kv"><span class="k">Generation</span><span class="v">4</span></div>
      <div class="kv"><span class="k">Dimensions</span><span class="v">768</span></div>
      <div class="kv"><span class="k">Chunks</span><span class="v">1,284</span></div>
      <div class="kv"><span class="k">Metric</span><span class="v">cosine</span></div>
      <div class="set-note">
        Switching the embedding model creates a new index generation. Incompatible vectors are never
        mixed.
      </div>
      <button
        class="btn secondary sm"
        type="button"
        style="width:100%;margin-top:10px"
        onclick={() => app.toast('Index generation 4 revalidated · 1,284 vectors')}
      >
        Revalidate index
      </button>
    </div>
  </div>

  <div class="local-strip">
    <span><Icon name="lock" size={11} /> Endpoint 127.0.0.1:8080</span>
    <span><Icon name="shield" size={11} /> Redirects blocked</span>
    <span><Icon name="eye" size={11} /> External egress none</span>
    <span>A missing local role fails visibly; it never selects a hosted service.</span>
  </div>

  <div class="section-label" style="margin-top:32px">
    Local catalog <span class="line"></span><span class="count"
      >{catalog.filter((model) => model.installed).length} installed</span
    >
  </div>
  <div class="panel">
    {#each catalog as model (model.id)}
      <div class="catalog-row" class:off={!model.installed}>
        <span class="mark"><Icon name="cpu" size={14} /></span>
        <div class="c-main">
          <div class="c-name">{model.name}</div>
          <div class="c-meta">{model.params} · {model.quant} · {model.size} · {model.runtime}</div>
        </div>
        {#if model.installed}
          <Chip tone="outline" dot>Local</Chip>
          <button class="btn ghost sm" type="button" onclick={() => remove(model)}>Remove</button>
        {:else if model.id === 'llama-70b'}
          <Chip tone="outline">Needs 48 GB</Chip>
        {:else}
          <button class="btn secondary sm" type="button" onclick={() => install(model)}
            >Add locally</button
          >
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .auto-form h3 {
    font-family: var(--serif);
    font-size: 20px;
    font-weight: 700;
  }
  .role-model-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .panel .mark {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    color: var(--text-muted);
  }
  .local-strip {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    margin-top: 18px;
    font-size: 11px;
    color: var(--text-faint);
  }
  .local-strip span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
</style>
