<script lang="ts">
  import { onMount } from "svelte";
  import type { SplyceEventEnvelope } from "@splyce/pi/contracts";
  import TurnStream from "../../src/components/TurnStream.svelte";
  import {
    createTurnStreamTransport,
    createTurnsState,
    type TurnsState,
  } from "../../src/stores/turns";

  let state = $state.raw<TurnsState>(createTurnsState());
  const transport = createTurnStreamTransport({
    onState: (next) => {
      state = next;
    },
  });
  let run = $derived(
    state.currentRunId ? state.runs[state.currentRunId] : undefined,
  );

  function play(events: SplyceEventEnvelope[]) {
    const first = events[0];
    if (!first) return;
    transport.follow(first.sessionId, first.scopeId);
    for (const event of events) transport.enqueue(event);
    transport.flush();
  }

  onMount(() => {
    (window as unknown as { __td34: { play: typeof play } }).__td34 = { play };
  });
</script>

{#if run}
  <TurnStream {run} onApproval={() => {}} />
{:else}
  <p data-testid="empty">No turn</p>
{/if}
