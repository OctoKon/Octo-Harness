<script lang="ts">
  import { onDestroy } from 'svelte';
  import { slide } from 'svelte/transition';
  import { app } from '../lib/state.svelte';
  import { mcpServers, skills as seedSkills } from '../lib/data';
  import type { McpServer, Skill } from '../lib/types';
  import PageHead from '../lib/PageHead.svelte';
  import Icon from '../lib/Icon.svelte';
  import Chip from '../lib/Chip.svelte';
  import Switch from '../lib/Switch.svelte';

  let servers = $state<McpServer[]>(mcpServers.map((server) => ({ ...server })));
  let skills = $state<Skill[]>(seedSkills.map((skill) => ({ ...skill })));
  let expanded = $state<string | null>('mcp-fs');
  let testing = $state<string | null>(null);
  let adding = $state(false);
  let newName = $state('');
  let newCommand = $state('');
  let newGrant = $state<'Read-only' | 'Workspace write' | 'Network'>('Read-only');
  let formError = $state('');
  let folderInput: HTMLInputElement | undefined = $state();
  let timer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });

  const enabledServers = $derived(servers.filter((server) => server.enabled).length);

  function toggleServer(server: McpServer, enabled: boolean) {
    server.enabled = enabled;
    app.toast(
      `${server.name} ${enabled ? 'enabled' : 'disabled'} · tools ${enabled ? 'available' : 'withdrawn'}`,
    );
  }

  function toggleSkill(skill: Skill, enabled: boolean) {
    skill.enabled = enabled;
    app.toast(`${skill.name} ${enabled ? 'enabled' : 'disabled'}`);
  }

  function test(server: McpServer) {
    if (testing) return;
    testing = server.id;
    timer = setTimeout(() => {
      testing = null;
      app.toast(`Handshake ok · ${server.name} · ${server.tools} tools · v${server.version}`);
    }, 1000);
  }

  function addServer() {
    if (!newName.trim() || !newCommand.trim()) {
      formError = 'A name and a local command are required.';
      return;
    }
    const server: McpServer = {
      id: `mcp-${Date.now()}`,
      name: newName.trim(),
      command: newCommand.trim(),
      transport: 'stdio',
      version: '0.1.0',
      tools: 1,
      grant: newGrant,
      enabled: true,
      tools_list: [{ name: 'handshake', scope: 'no tools advertised yet' }],
    };
    servers = [...servers, server];
    adding = false;
    newName = '';
    newCommand = '';
    formError = '';
    app.toast('MCP server added · handshake pending');
  }

  function removeServer(id: string) {
    servers = servers.filter((server) => server.id !== id);
    if (expanded === id) expanded = null;
    app.toast('Server removed · owned process cleanup recorded');
  }

  function importSkill(event: Event) {
    const files = (event.currentTarget as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    const folder = files[0].webkitRelativePath.split('/')[0] || 'local-skill';
    const skill: Skill = {
      id: `sk-${Date.now()}`,
      name: folder,
      description:
        'Imported from a local folder. Review the instructions before enabling it for a run.',
      provenance: `local folder · ${folder}`,
      version: 'local',
      scope: 'Workspace',
      enabled: false,
    };
    skills = [...skills, skill];
    app.toast(`${folder} imported · review before enabling`);
  }
</script>

<div class="page">
  <PageHead
    eyebrow="MCP · skills · local tooling"
    title="Extensions"
    sub="Capabilities can be added, but they cannot grant themselves authority. Every tool call meets the same policy boundary."
  >
    <button class="btn primary" type="button" onclick={() => (adding = !adding)}>
      <Icon name="plus" size={13} /> Add MCP server
    </button>
  </PageHead>

  <div class="callout">
    <Icon name="shield" size={15} />
    <div>
      <div class="co-title">Extension code is trusted code, not a sandbox.</div>
      <div class="co-body">
        MCP servers, skills and plugins run under the effective grants of the run. A tool that is
        not advertised, or whose schema changed after handshake, is denied before dispatch.
      </div>
    </div>
  </div>

  {#if adding}
    <div class="auto-form" style="margin-bottom:var(--gutter)" transition:slide={{ duration: 160 }}>
      <h3>Add a local MCP server</h3>
      <div class="form-grid">
        <div class="field">
          <label for="mcp-name">Name</label>
          <input id="mcp-name" bind:value={newName} placeholder="e.g. linear" />
        </div>
        <div class="field">
          <label for="mcp-grant">Maximum grant</label>
          <select id="mcp-grant" class="select" bind:value={newGrant}>
            <option>Read-only</option>
            <option>Workspace write</option>
            <option>Network</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="mcp-command">Command</label>
        <input id="mcp-command" bind:value={newCommand} placeholder="npx @scope/server --stdio" />
      </div>
      {#if formError}<p class="form-error">{formError}</p>{/if}
      <div class="form-actions">
        <button class="btn primary sm" type="button" onclick={addServer}>Add server</button>
        <button
          class="btn ghost sm"
          type="button"
          onclick={() => {
            adding = false;
            formError = '';
          }}>Cancel</button
        >
        <span class="muted t-micro" style="margin-left:auto"
          >stdio only · no credentials in receipts</span
        >
      </div>
    </div>
  {/if}

  <div class="section-label">
    MCP servers <span class="line"></span><span class="count">{enabledServers} enabled</span>
  </div>
  <div class="panel">
    {#each servers as server (server.id)}
      <div class="ext" class:off={!server.enabled}>
        <div class="row">
          <span class="mark">{server.name.slice(0, 2).toUpperCase()}</span>
          <div class="row-main">
            <div class="row-title">
              {server.name}
              <Chip tone="outline">{server.transport}</Chip>
              <span class="muted t-micro">v{server.version}</span>
            </div>
            <div class="row-sub">
              {server.tools} tools · {server.grant === 'Network' ? 'localhost only' : 'scoped'} · local
              command
            </div>
          </div>
          <div class="row-right">
            <Chip tone={server.grant === 'Network' ? 'err' : 'outline'}>{server.grant}</Chip>
            <button
              class="btn ghost sm"
              type="button"
              onclick={() => (expanded = expanded === server.id ? null : server.id)}
            >
              {expanded === server.id ? 'Hide' : 'Tools'}
            </button>
            <Switch
              checked={server.enabled}
              label={`Enable ${server.name}`}
              onchange={(enabled) => toggleServer(server, enabled)}
            />
          </div>
        </div>
        {#if expanded === server.id}
          <div class="ext-tools" transition:slide={{ duration: 160 }}>
            {#each server.tools_list as tool (tool.name)}
              <div class="tool-line" class:blocked={tool.scope.includes('blocked')}>
                <Icon name="tool" size={11} />
                <span>{tool.name}</span>
                <span class="scope">{tool.scope}</span>
              </div>
            {/each}
            <div class="tool-line" style="border-top:0;padding-top:10px">
              <code style="font-size:10px;color:var(--text-faint)">{server.command}</code>
            </div>
            <div class="form-actions" style="margin-top:4px">
              <button
                class="btn secondary sm"
                type="button"
                onclick={() => test(server)}
                disabled={testing !== null}
              >
                {testing === server.id ? 'Testing…' : 'Test handshake'}
              </button>
              <button class="btn ghost sm" type="button" onclick={() => removeServer(server.id)}
                >Remove server</button
              >
              <div class="muted t-micro ext-hint">granted at dispatch, not at handshake</div>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="section-label" style="margin-top:32px">
    Skills <span class="line"></span><span class="count"
      >{skills.filter((skill) => skill.enabled).length} enabled</span
    >
    <button class="btn ghost sm" type="button" onclick={() => folderInput?.click()}>
      <Icon name="folder" size={12} /> Import
    </button>
    <input
      bind:this={folderInput}
      type="file"
      webkitdirectory
      style="display:none"
      aria-label="Import a skill folder"
      onchange={importSkill}
    />
  </div>
  <div class="panel">
    {#each skills as skill (skill.id)}
      <div class="skill-row">
        <span class="l-ico" style="margin:1px 0 0;flex:none"><Icon name="layers" size={15} /></span>
        <div class="s-main">
          <div class="s-title">{skill.name} <Chip tone="outline">{skill.scope}</Chip></div>
          <div class="s-desc">{skill.description}</div>
          <div class="s-prov">{skill.provenance} · v{skill.version}</div>
        </div>
        <div class="s-right">
          <Switch
            checked={skill.enabled}
            label={`Enable ${skill.name}`}
            onchange={(enabled) => toggleSkill(skill, enabled)}
          />
        </div>
      </div>
    {/each}
  </div>

  <p class="set-note">
    Skill instructions cannot widen grants. Imported provenance is pinned in the journal; an update
    creates a new revision.
  </p>
</div>

<style>
  .row-right :global(.chip) {
    flex: none;
  }
  .ext-tools code {
    display: block;
    overflow-wrap: anywhere;
    line-height: 16px;
  }
  .auto-form h3 {
    font-family: var(--serif);
    font-size: 20px;
    font-weight: 700;
  }
</style>
