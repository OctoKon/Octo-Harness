<script lang="ts">
  import { onMount } from "svelte";
  import type { Handshake } from "@splyce/pi/contracts";
  import TurnStream from "./components/TurnStream.svelte";
  import {
    connectionState,
    handshake,
    onEvent,
    subscribe,
  } from "./stores/engine";
  import { bindSelection, type BindingStatus } from "./stores/session-selection";
  import {
    createTurnStreamTransport,
    createTurnsState,
    type TurnsState,
  } from "./stores/turns";

  let status = $state("disconnected");
  let readiness = $state<Handshake["readiness"] | null>(null);
  let engineConnected = $state(false);
  let stopped = $derived(engineConnected && status === "disconnected");
  let turns = $state.raw<TurnsState>(createTurnsState());
  let subscription = $state<BindingStatus>({ state: "idle" });
  let retry = $state<() => void>(() => {});
  let currentRun = $derived(
    turns.currentRunId ? turns.runs[turns.currentRunId] : undefined,
  );

  function onApproval() {
    // Session context arrives with the workbench (TD-08/TD-30); never invent revisions here.
  }

  onMount(() => {
    let mounted = true;
    // The workbench selects the session (session-selection store); none is derived from events.
    const transport = createTurnStreamTransport({
      onState: (next) => {
        turns = next;
      },
      onResync: (fromSeq, sessionId) => {
        void binding.resubscribe(sessionId, fromSeq);
      },
    });
    const binding = bindSelection(transport, subscribe);
    const unsubState = connectionState.subscribe((val) => {
      status = val;
      if (val === "disconnected") readiness = null;
    });
    const unsubBinding = binding.status.subscribe((next) => {
      subscription = next;
    });
    retry = () => void binding.retry();
    const unsubEvents = onEvent((event) => transport.enqueue(event));

    handshake()
      .then((verified) => {
        if (!mounted) return;
        readiness = status === "disconnected" ? null : verified.readiness;
        engineConnected = true;
      })
      .catch(() => {
        // The engine store publishes the unavailable/error state.
      });

    return () => {
      mounted = false;
      unsubState();
      unsubEvents();
      unsubBinding();
      binding.dispose();
      transport.dispose();
    };
  });
</script>

<main
  class="app-shell"
  data-testid="app-shell"
  data-connection-state={status}
  data-readiness-policy={readiness ? readiness.policy : "unknown"}
  data-readiness-store={readiness ? readiness.store : "unknown"}
  data-readiness-receipts={readiness ? readiness.receipts : "unknown"}
>
  <header class="app-header">
    <div class="brand">
      <h1>Splyce</h1>
      <span class="status-badge" class:ready={status === "ready"} class:unavailable={status !== "ready"}>
        {stopped ? "engine stopped" : status}
      </span>
    </div>
  </header>

  {#if subscription.state === "failed"}
    <div class="subscribe-error" role="alert" data-testid="subscribe-error">
      <span>Could not subscribe to the session: {subscription.error}</span>
      <button type="button" onclick={retry}>Retry</button>
    </div>
  {/if}

  <div class="app-content" class:conversation={currentRun !== undefined}>
    {#if status !== "ready"}
      <div class="unavailable-view" data-testid="unavailable-banner" role="status" aria-live="polite">
        <h2>{stopped ? "Engine stopped" : "Engine Unavailable"}</h2>
        <p>
          {stopped
            ? "The native engine exited. Restart the app to reconnect; the last transcript may be incomplete."
            : "Backend native services (policy, durable store, and receipts) are currently initializing or unavailable. Release qualification requires all three subsystems verified before task execution."}
        </p>
      </div>
    {/if}
    {#if currentRun}
      <section class="turn-pane" aria-label="Transcript">
        <TurnStream
          run={currentRun}
          stale={turns.stale || turns.needsResync || status !== "ready"}
          showApprovalControls={false}
          canRespond={() => false}
          {onApproval}
        />
      </section>
    {:else if status === "ready"}
      <div class="workspace-view">
        <p>Ready for workspace execution.</p>
      </div>
    {/if}
  </div>
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
  }
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #111827;
    background: #f9fafb;
  }
  .app-header {
    display: flex;
    align-items: center;
    padding: 12px 20px;
    background: #ffffff;
    border-bottom: 1px solid #e5e7eb;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand h1 {
    font-size: 1.125rem;
    margin: 0;
    font-weight: 700;
  }
  .status-badge {
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    background: #f3f4f6;
    color: #4b5563;
  }
  .status-badge.ready {
    background: #d1fae5;
    color: #065f46;
  }
  .status-badge.unavailable {
    background: #fee2e2;
    color: #991b1b;
  }
  .subscribe-error {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 20px;
    background: #fee2e2;
    color: #991b1b;
    font-size: 0.875rem;
  }
  .app-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .app-content.conversation {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
    justify-content: flex-start;
    overflow-y: auto;
  }
  .turn-pane {
    width: 100%;
    max-width: 880px;
    margin: 0 auto;
  }
  .unavailable-view {
    max-width: 480px;
    text-align: center;
    padding: 32px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }
  .unavailable-view h2 {
    margin-top: 0;
    color: #b91c1c;
  }
  .unavailable-view p {
    color: #4b5563;
    font-size: 0.875rem;
    line-height: 1.5;
  }
</style>
