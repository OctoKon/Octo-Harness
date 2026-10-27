<script lang="ts">
  import { tick } from "svelte";
  import {
    emptyMessage,
    localityLabel,
    type MemoryEntry,
    type MemoryStatus,
  } from "../../stores/memory-view";

  let {
    entries,
    status = "on",
    stale = false,
    onForget,
  }: {
    entries: MemoryEntry[];
    status?: MemoryStatus;
    /** The list may be behind the engine's current revision. */
    stale?: boolean;
    onForget: (observationId: string) => Promise<void>;
  } = $props();

  let confirming = $state<string | null>(null);
  let inflight = $state<string | null>(null);
  let failed = $state<Record<string, true>>({});
  let listEl: HTMLElement;

  async function restoreFocus(id: string): Promise<void> {
    await tick();
    if (!listEl?.isConnected) return;
    const target = [...listEl.querySelectorAll<HTMLElement>("[data-forget]")].find(
      (el) => el.dataset.forget === id,
    );
    (target ?? listEl).focus();
  }

  function cancel(id: string): void {
    confirming = null;
    void restoreFocus(id);
  }

  async function confirm(id: string): Promise<void> {
    if (inflight !== null) return;
    inflight = id;
    const { [id]: _drop, ...rest } = failed;
    failed = rest;
    try {
      await onForget(id);
    } catch {
      // Fixed copy only: the raw error may carry paths or secrets.
      failed = { ...failed, [id]: true };
    }
    inflight = null;
    confirming = null;
    void restoreFocus(id);
  }
</script>

<section
  bind:this={listEl}
  tabindex="-1"
  aria-labelledby="memory-title"
  aria-busy={status === "loading" ? "true" : undefined}
  data-testid="memory-list"
>
  <h3 id="memory-title">Memory</h3>

  {#if status === "loading"}
    <p role="status" data-testid="memory-loading">{emptyMessage("loading")}</p>
  {:else if status === "error"}
    <p role="alert" data-testid="memory-error">{emptyMessage("error")}</p>
  {:else if status !== "on" || entries.length === 0}
    <p data-testid="memory-empty">{emptyMessage(status, stale)}</p>
  {/if}

  {#if status !== "unavailable" && status !== "error"}
    {#if stale && entries.length > 0}
      <p role="status" data-testid="memory-stale">
        These items may be out of date. The engine has not confirmed the current
        revision.
      </p>
    {/if}
    <ul>
      {#each entries as e (e.observation.observationId)}
        {@const id = e.observation.observationId}
        <li data-testid="memory-item">
          <p>{e.claim ?? "Claim unavailable"}</p>
          <dl>
            <dt>Source</dt>
            <dd>{e.source}</dd>
            <dt>Scope</dt>
            <dd>{e.scope}</dd>
            <dt>Locality</dt>
            <dd data-testid="memory-locality">{localityLabel(e.locality)}</dd>
          </dl>

          {#if e.state === "purge-pending"}
            <p role="status" data-testid="memory-purge">
              Purge pending. Not yet confirmed deleted by the engine.
            </p>
          {:else if confirming === id}
            <div role="alertdialog" aria-label="Confirm forget" data-testid="memory-confirm">
              <p>Forget this memory? This cannot be undone.</p>
              <!-- svelte-ignore a11y_autofocus -->
              <button type="button" autofocus onclick={() => cancel(id)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={inflight !== null}
                onclick={() => confirm(id)}
              >
                Forget memory
              </button>
            </div>
          {:else}
            <button
              type="button"
              data-forget={id}
              aria-label={`Forget: ${e.claim ?? id}`}
              onclick={() => (confirming = id)}
            >
              Forget
            </button>
          {/if}

          {#if failed[id]}
            <p role="alert">
              Forget failed. The memory is still stored. Try again.
            </p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
