<script lang="ts">
  import { statusLabel } from "../status-labels";

  let { status = null }: { status?: string | null } = $props();

  const label = $derived(statusLabel(status));
</script>

<span class="status-label" data-testid="status-label">{label}</span>

<style>
  .status-label {
    font-size: 0.8125rem;
    font-weight: 500;
  }
</style>
