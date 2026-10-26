<script lang="ts">
  import { flushSync } from 'svelte';
  import { fly } from 'svelte/transition';
  import { app } from '../lib/state.svelte';
  import { workspaces } from '../lib/data';
  import type { Page } from '../lib/types';
  import Mark from '../lib/Mark.svelte';
  import Icon from '../lib/Icon.svelte';
  import { clickOutside } from '../lib/actions';

  let {
    open = $bindable(false),
    collapsed = false,
    onfold,
  }: { open?: boolean; collapsed?: boolean; onfold?: () => void } = $props();
  let wsOpen = $state(false);
  let closeEl = $state<HTMLButtonElement>();
  let themeBusy = false;

  const approvals = $derived(
    app.runs.filter((run) => run.status === 'approval' && !run.approval).length,
  );

  $effect(() => {
    if (open) closeEl?.focus();
  });

  function go(page: Page) {
    app.go(page);
    open = false;
  }

  function home() {
    app.go('work');
    open = false;
  }

  function toggleTheme(event: MouseEvent) {
    const root = document.documentElement;
    const reduced =
      root.dataset.motion === 'reduced' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = (
      document as Document & {
        startViewTransition?: (callback: () => void) => {
          ready: Promise<void>;
          finished: Promise<void>;
        };
      }
    ).startViewTransition;

    if (!start || reduced || themeBusy) {
      if (!themeBusy) app.toggleTheme();
      return;
    }

    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX || box.left + box.width / 2;
    const y = event.clientY || box.top + box.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    themeBusy = true;
    const transition = start.call(document, () => flushSync(() => app.toggleTheme()));
    transition.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration: 520,
            easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
            pseudoElement: '::view-transition-new(root)',
          } as KeyframeAnimationOptions,
        );
      })
      .catch(() => {});
    transition.finished.finally(() => (themeBusy = false));
  }
</script>

<aside class="side" class:open class:collapsed id="app-sidebar" inert={collapsed && !open}>
  <button
    class="side-close icon-btn"
    type="button"
    aria-label="Close navigation"
    bind:this={closeEl}
    onclick={() => (open = false)}
  >
    <Icon name="x" size={18} />
  </button>
  <button
    class="side-fold icon-btn"
    type="button"
    aria-label="Collapse sidebar"
    title="Collapse sidebar"
    onclick={() => onfold?.()}
  >
    <Icon name="chevron-left" size={15} />
  </button>
  <button class="brand" type="button" onclick={home} title="Go to Work">
    <Mark size={22} />
    Splyce
    <em>reference</em>
  </button>

  <div class="ws-wrap" use:clickOutside={() => (wsOpen = false)}>
    <button class="ws" type="button" aria-expanded={wsOpen} onclick={() => (wsOpen = !wsOpen)}>
      <span class="ws-badge">PA</span>
      <span class="ws-name">{app.workspace.name}</span>
      <Icon name="chevron-down" size={13} />
    </button>
    {#if wsOpen}
      <div class="menu" transition:fly={{ y: -4, duration: 120 }}>
        <div class="menu-note">Local workspaces</div>
        {#each workspaces as workspace (workspace.id)}
          <button
            type="button"
            data-active={workspace.id === app.workspaceId}
            onclick={() => {
              app.setWorkspace(workspace.id);
              wsOpen = false;
            }}
          >
            <span>{workspace.name}</span>
            {#if workspace.id === app.workspaceId}
              <span style="margin-left:auto"><Icon name="check" size={13} /></span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <nav class="nav" aria-label="Workspace">
    <button class="nav-item" class:active={app.page === 'work'} onclick={() => go('work')}>
      <span class="n-ico"><Icon name="terminal" size={15} /></span>
      Work
    </button>
    <button
      class="nav-item"
      class:active={app.page === 'runs' || app.page === 'run'}
      onclick={() => go('runs')}
    >
      <span class="n-ico"><Icon name="clock" size={15} /></span>
      Runs
      {#if approvals}<span class="n-count">{approvals}</span>{/if}
    </button>
    <button class="nav-item" class:active={app.page === 'memory'} onclick={() => go('memory')}>
      <span class="n-ico"><Icon name="database" size={15} /></span>
      Memory
    </button>
    <button class="nav-item" class:active={app.page === 'models'} onclick={() => go('models')}>
      <span class="n-ico"><Icon name="cpu" size={15} /></span>
      Models
    </button>
    <button
      class="nav-item"
      class:active={app.page === 'extensions'}
      onclick={() => go('extensions')}
    >
      <span class="n-ico"><Icon name="layers" size={15} /></span>
      Extensions
    </button>
    <button class="nav-item" class:active={app.page === 'settings'} onclick={() => go('settings')}>
      <span class="n-ico"><Icon name="settings" size={15} /></span>
      Settings
    </button>
  </nav>

  <div class="side-foot">
    <div class="side-foot-row">
      <span class="side-status"><span class="dot"></span> Pi engine · local</span>
      <button
        class="icon-btn"
        type="button"
        aria-label={app.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        title={app.theme === 'light' ? 'Dark theme' : 'Light theme'}
        onclick={toggleTheme}
      >
        <Icon name={app.theme === 'light' ? 'moon' : 'sun'} size={14} />
      </button>
    </div>
    <div class="fine">No cloud fallback · AGPL-3.0</div>
  </div>
</aside>

<style>
  .ws-wrap {
    position: relative;
    margin-bottom: 14px;
  }
  .ws-wrap .ws {
    margin-bottom: 0;
  }
  .ws-wrap :global(.menu) {
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    min-width: 0;
  }
  .side-close {
    display: none;
    position: absolute;
    top: 14px;
    right: 12px;
    width: 28px;
    height: 28px;
    z-index: 2;
  }
  @media (max-width: 820px) {
    .side-close {
      display: grid;
      top: 8px;
      right: 16px;
      width: 36px;
      height: 36px;
      border: 1px solid var(--border);
      background: var(--neutral);
      color: var(--on-surface);
    }
  }
</style>
