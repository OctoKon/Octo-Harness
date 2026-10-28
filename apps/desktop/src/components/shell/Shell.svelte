<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import {
    initialShell,
    layoutMode,
    normalizeShell,
    shortcutPanel,
    togglePanel,
    visiblePanes,
    type Panel,
    type ShellState,
  } from "../../stores/shell";

  let {
    rail,
    transcript,
    composer,
    evidence,
    showComposer = true,
    contentLabel = "Conversation",
    quietToolbar = false,
  }: {
    rail: Snippet<[onFold: () => void]>;
    transcript: Snippet;
    composer: Snippet;
    evidence: Snippet;
    showComposer?: boolean;
    contentLabel?: string;
    quietToolbar?: boolean;
  } = $props();

  let width = $state(window.innerWidth);
  const mode = $derived(layoutMode(width));
  let shell = $state<ShellState>(initialShell(layoutMode(window.innerWidth)));
  let lastMode = layoutMode(window.innerWidth);
  const panes = $derived(visiblePanes(shell, mode));

  let railBtn = $state<HTMLButtonElement>();
  let evidenceBtn = $state<HTMLButtonElement>();

  /** Apply a new state; if the focused element lives in a pane that is hiding, focus its toggle. */
  async function apply(next: ShellState, nextMode = mode) {
    const was = visiblePanes(shell, mode);
    const will = visiblePanes(next, nextMode);
    const active = document.activeElement;
    const lost: Panel[] = [];
    if (
      was.rail &&
      !will.rail &&
      document.getElementById("shell-rail")?.contains(active)
    )
      lost.push("rail");
    if (
      was.evidence &&
      !will.evidence &&
      document.getElementById("shell-evidence")?.contains(active)
    )
      lost.push("evidence");
    shell = next;
    if (lost.length > 0) {
      await tick();
      (lost[0] === "rail" ? railBtn : evidenceBtn)?.focus();
    }
  }

  function onresize() {
    width = window.innerWidth;
    const next = layoutMode(width);
    if (next === lastMode) return;
    lastMode = next;
    void apply(normalizeShell(shell, next), next);
  }

  function toggle(panel: Panel) {
    void apply(togglePanel(shell, panel, mode));
  }

  function onkeydown(e: KeyboardEvent) {
    const panel = shortcutPanel(e);
    if (!panel) return;
    e.preventDefault();
    toggle(panel);
  }
</script>

<svelte:window {onresize} {onkeydown} />

<div
  class="shell"
  class:quiet-toolbar={quietToolbar &&
    panes.rail &&
    !panes.evidence &&
    mode !== "narrow"}
  data-layout={mode}
>
  <div class="toolbar" role="toolbar" aria-label="Panels">
    <button
      type="button"
      bind:this={railBtn}
      aria-expanded={shell.rail}
      aria-controls="shell-rail"
      aria-keyshortcuts="Control+B"
      title="Projects and tasks (Ctrl+B)"
      onclick={() => toggle("rail")}>Projects and tasks</button
    >
    <button
      type="button"
      bind:this={evidenceBtn}
      aria-expanded={shell.evidence}
      aria-controls="shell-evidence"
      aria-keyshortcuts="Control+Shift+E"
      title="Changes and evidence (Ctrl+Shift+E)"
      onclick={() => toggle("evidence")}>Changes and evidence</button
    >
  </div>
  <div class="body">
    {#if panes.rail}
      <nav id="shell-rail" aria-label="Projects and tasks">
        {@render rail(() => toggle("rail"))}
      </nav>
    {/if}
    <div class="main-column" class:panel-only={!panes.conversation}>
      {#if panes.conversation}
        <main aria-label={contentLabel}>
          {@render transcript()}
        </main>
      {/if}
      {#if showComposer}
        <footer aria-label="Message composer">
          {@render composer()}
        </footer>
      {/if}
    </div>
    {#if panes.evidence}
      <aside id="shell-evidence" aria-label="Changes and evidence">
        {@render evidence()}
      </aside>
    {/if}
  </div>
</div>

<style>
  .shell {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh;
    min-width: 0;
    color: var(--on-surface, #0d0d0d);
    background: var(--neutral, #ffffff);
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    position: absolute;
    top: 10px;
    right: 14px;
    z-index: 2;
    flex-shrink: 0;
  }
  .quiet-toolbar .toolbar:not(:focus-within) {
    clip-path: inset(50%);
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
  .quiet-toolbar .main-column {
    padding-top: 0;
  }
  .toolbar button {
    padding: 4px 10px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted, #666);
    background: var(--neutral, #ffffff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 6px;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .toolbar button:hover {
    background: var(--surface, #f7f7f7);
    color: var(--on-surface, #0d0d0d);
  }
  .toolbar button[aria-expanded="true"] {
    background: var(--surface, #f7f7f7);
    color: var(--on-surface, #0d0d0d);
  }
  .body {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  nav#shell-rail {
    width: 240px;
    flex: 0 0 240px;
    border-right: 1px solid var(--border, #e5e7eb);
    background: var(--neutral, #ffffff);
    overflow-y: auto;
    box-sizing: border-box;
  }
  .main-column {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding-top: 44px;
  }
  main {
    flex: 1;
    min-width: 0;
    overflow: auto;
    background: var(--neutral, #ffffff);
  }
  aside#shell-evidence {
    width: 280px;
    min-width: 240px;
    border-left: 1px solid var(--border, #e5e7eb);
    background: var(--surface, #f7f7f7);
    overflow-y: auto;
    box-sizing: border-box;
  }
  [data-layout="narrow"] .body {
    flex-direction: column;
    padding-top: 44px;
  }
  [data-layout="narrow"] nav#shell-rail,
  [data-layout="narrow"] aside#shell-evidence {
    flex: 1;
    width: auto;
    max-width: none;
    min-width: 0;
    min-height: 0;
  }
  [data-layout="narrow"] .main-column {
    padding-top: 0;
  }
  [data-layout="narrow"] .panel-only {
    flex: none;
  }
  footer {
    border-top: 1px solid var(--border, #e5e7eb);
    background: var(--neutral, #ffffff);
    flex-shrink: 0;
    box-sizing: border-box;
  }
  button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
</style>
