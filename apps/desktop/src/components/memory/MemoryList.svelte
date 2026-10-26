<script lang="ts">
  import {
    emptyMessage,
    localityLabel,
    type MemoryEntry,
    type MemoryStatus,
  } from "../../stores/memory-view";

  let {
    entries,
    status = "on",
    onForget,
  }: {
    entries: MemoryEntry[];
    status?: MemoryStatus;
    onForget: (observationId: string) => Promise<void>;
  } = $props();

  let confirming = $state<string | null>(null);
  let requested = $state<Record<string, true>>({});
  let errors = $state<Record<string, string>>({});

  async function confirm(id: string): Promise<void> {
    try {
      await onForget(id);
      requested = { ...requested, [id]: true };
      const { [id]: _drop, ...rest } = errors;
      errors = rest;
    } catch (e) {
      errors = {
        ...errors,
        [id]: e instanceof Error ? e.message : String(e),
      };
    }
    confirming = null;
  }
</script>

<section aria-labelledby="memory-title" data-testid="memory-list">
  <h3 id="memory-title">Memory</h3>

  {#if status !== "on" || entries.length === 0}
    <p data-testid="memory-empty">{emptyMessage(status)}</p>
  {/if}

  {#if status !== "unavailable"}
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

          {#if e.state === "purge-pending" || requested[id]}
            <p role="status" data-testid="memory-purge">
              {e.state === "purge-pending"
                ? "Purge pending. Not yet confirmed deleted by the engine."
                : "Forget requested. Waiting for the engine to confirm."}
            </p>
          {:else if confirming === id}
            <div role="alertdialog" aria-label="Confirm forget" data-testid="memory-confirm">
              <p>Forget this memory? This cannot be undone.</p>
              <!-- svelte-ignore a11y_autofocus -->
              <button type="button" autofocus onclick={() => (confirming = null)}>
                Cancel
              </button>
              <button type="button" onclick={() => confirm(id)}>
                Forget memory
              </button>
            </div>
          {:else}
            <button
              type="button"
              aria-label={`Forget: ${e.claim ?? id}`}
              onclick={() => (confirming = id)}
            >
              Forget
            </button>
          {/if}

          {#if errors[id]}
            <p role="alert">Forget failed: {errors[id]}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
