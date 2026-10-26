<script lang="ts">
  import StatusLabel from "./StatusLabel.svelte";
  import SupportStatus from "./SupportStatus.svelte";
  import { statusLabel } from "../status-labels";

  let { status = "unknown" }: { status?: string } = $props();

  const supportCells = [
    { id: "run", label: "Runs", status: "tested" as const, count: 1 },
    { id: "action", label: "Actions", status: "supported" as const, count: 1 },
    { id: "outcome", label: "Outcomes", status: "unknown" as const, count: 0 },
  ];
</script>

<section class="status-panel" data-testid="status-panel">
  <p>Current: <StatusLabel {status} /></p>
  <SupportStatus title="Support matrix" cells={supportCells} help="Fixed projection." />
  <p class="sr-only">{statusLabel(status)}</p>
</section>

<style>
  .status-panel { padding: 8px; }
  .sr-only { position: absolute; left: -9999px; }
</style>
