<script module lang="ts">
  export type WorkbenchView =
    "work" | "runs" | "memory" | "models" | "extensions" | "settings";
</script>

<script lang="ts">
  import Mark from "../../../prototype/src/lib/Mark.svelte";
  import Icon from "../../../prototype/src/lib/Icon.svelte";
  import type { IconName } from "../../../prototype/src/lib/icons";

  let {
    view,
    onNavigate,
    workspaceLabel,
    choosing,
    chooserReason,
    chooserError,
    onChooseWorkspace,
    theme,
    onToggleTheme,
    engineLabel,
    providerLabel,
    runCount,
    onFold,
  }: {
    view: WorkbenchView;
    onNavigate: (view: WorkbenchView) => void;
    workspaceLabel: string | null;
    choosing: boolean;
    chooserReason: string | null;
    chooserError: string | null;
    onChooseWorkspace: () => void;
    theme: "light" | "dark";
    onToggleTheme: () => void;
    engineLabel: string;
    providerLabel: string;
    runCount: number;
    onFold: () => void;
  } = $props();

  const pages: { view: WorkbenchView; label: string; icon: IconName }[] = [
    { view: "work", label: "Work", icon: "terminal" },
    { view: "runs", label: "Runs", icon: "clock" },
    { view: "memory", label: "Memory", icon: "database" },
    { view: "models", label: "Models", icon: "cpu" },
    { view: "extensions", label: "Extensions", icon: "layers" },
    { view: "settings", label: "Settings", icon: "settings" },
  ];
</script>

<div class="sidebar">
  <div class="brand-row">
    <button
      class="fold"
      type="button"
      aria-label="Collapse sidebar"
      onclick={onFold}
    >
      <Icon name="chevron-left" size={15} />
    </button>
    <button
      class="brand"
      type="button"
      aria-label="Go to Work"
      onclick={() => onNavigate("work")}
    >
      <Mark size={22} /> Splyce
    </button>
  </div>

  <button
    class="workspace"
    type="button"
    aria-label="Choose project"
    aria-describedby="project-status"
    disabled={choosing || chooserReason !== null}
    onclick={onChooseWorkspace}
  >
    <span class="workspace-badge"><Icon name="folder" size={13} /></span>
    <span
      class="workspace-name"
      data-testid="project-name"
      title={workspaceLabel ?? "No project selected."}
    >
      {workspaceLabel ?? "No project selected."}
    </span>
    <Icon name="chevron-down" size={13} />
  </button>
  <p id="project-status" role="status">
    {choosing ? "Choosing project…" : (chooserReason ?? chooserError ?? "")}
  </p>

  <nav aria-label="Workspace">
    {#each pages as page (page.view)}
      <button
        class="nav-item"
        class:active={view === page.view}
        type="button"
        aria-label={page.label}
        aria-current={view === page.view ? "page" : undefined}
        onclick={() => onNavigate(page.view)}
      >
        <span class="nav-icon"><Icon name={page.icon} size={15} /></span>
        {page.label}
        {#if page.view === "runs" && runCount > 0}
          <span class="count" aria-label={`${runCount} runs`}>{runCount}</span>
        {/if}
      </button>
    {/each}
  </nav>

  <div class="side-foot">
    <div class="foot-row">
      <span class="engine">{engineLabel}</span>
      <button
        class="theme"
        type="button"
        aria-label={theme === "light"
          ? "Switch to dark theme"
          : "Switch to light theme"}
        onclick={onToggleTheme}
      >
        <Icon name={theme === "light" ? "moon" : "sun"} size={14} />
      </button>
    </div>
    <div class="provider">{providerLabel}</div>
  </div>
</div>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    box-sizing: border-box;
    padding: 16px 14px 14px;
    color: var(--on-surface, #0d0d0d);
    background: var(--neutral, #fff);
  }
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .brand-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 16px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0;
    border: 0;
    background: none;
    font-family: var(--serif, Georgia, serif);
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.01em;
  }
  .fold,
  .theme {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    padding: 0;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--r-md, 6px);
    background: var(--surface, #f7f7f7);
  }
  .workspace {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 9px;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--r-md, 6px);
    background: var(--neutral, #fff);
  }
  .workspace-badge {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex: none;
    border-radius: var(--r-sm, 4px);
    background: var(--primary, #0d0d0d);
    color: var(--primary-contrast, #fff);
  }
  .workspace-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    font-size: 12px;
    font-weight: 500;
  }
  #project-status {
    margin: 6px 0 8px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted, #666);
    overflow-wrap: anywhere;
  }
  #project-status:empty {
    margin: 0 0 14px;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 34px;
    padding: 0 9px;
    border: 0;
    border-radius: var(--r-md, 6px);
    background: transparent;
    color: var(--text-muted, #666);
    text-align: left;
    font-size: 14px;
  }
  .nav-item:hover,
  .nav-item.active,
  .workspace:hover {
    background: var(--surface, #f7f7f7);
    color: var(--on-surface, #0d0d0d);
  }
  .nav-item.active {
    font-weight: 500;
  }
  .nav-icon {
    display: flex;
    width: 16px;
    justify-content: center;
    flex: none;
  }
  .count {
    margin-left: auto;
    font-size: 11px;
  }
  .side-foot {
    margin-top: auto;
    padding-top: 14px;
    border-top: 1px solid var(--border, #e5e7eb);
  }
  .foot-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .engine {
    font-size: 11px;
    overflow-wrap: anywhere;
  }
  .provider {
    margin-top: 3px;
    color: var(--text-muted, #666);
    font-size: 10px;
    overflow-wrap: anywhere;
  }
  .theme {
    border-color: transparent;
    background: transparent;
  }
  button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }
  @media (forced-colors: active) {
    .nav-item.active {
      outline: 1px solid Highlight;
    }
  }
</style>
