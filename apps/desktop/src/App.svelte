<script lang="ts">
  import { onMount } from "svelte";
  import { connectionState, handshake } from "./stores/engine";

  let status = $state("disconnected");

  onMount(() => {
    const unsub = connectionState.subscribe((val) => {
      status = val;
    });

    handshake().catch(() => {
      // Handshake rejection leaves status in 'unavailable' or 'error'
    });

    return unsub;
  });
</script>

<main class="app-shell" data-testid="app-shell">
  <header class="app-header">
    <div class="brand">
      <h1>Splyce</h1>
      <span class="status-badge" class:ready={status === "ready"} class:unavailable={status !== "ready"}>
        {status}
      </span>
    </div>
  </header>

  <div class="app-content">
    {#if status === "ready"}
      <div class="workspace-view">
        <p>Ready for workspace execution.</p>
      </div>
    {:else}
      <div class="unavailable-view" data-testid="unavailable-banner">
        <h2>Engine Unavailable</h2>
        <p>
          Backend native services (policy, durable store, and receipts) are currently initializing or unavailable.
          Release qualification requires all three subsystems verified before task execution.
        </p>
      </div>
    {/if}
  </div>
</main>

<style>
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
  .app-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
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
