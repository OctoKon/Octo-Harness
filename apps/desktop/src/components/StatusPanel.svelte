<script lang="ts">
  import StatusLabel from "./StatusLabel.svelte";
  import SupportStatus from "./SupportStatus.svelte";
  import { statusLabel } from "../status-labels";
  import type { SupportCell } from "./SupportStatus.svelte";

  let {
    status = "unknown",
    cells = [],
  }: { status?: string; cells?: SupportCell[] } = $props();
</script>

<section class="status-panel" data-testid="status-panel">
  <p>Current: <StatusLabel {status} /></p>
  <SupportStatus title="Support matrix" {cells} help="Fixed projection." />
  <p class="sr-only">{statusLabel(status)}</p>
</section>

<style>
  .status-panel { padding: 8px; }
  .sr-only { position: absolute; left: -9999px; }
</style>
