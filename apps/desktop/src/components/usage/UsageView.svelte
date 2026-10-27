<script lang="ts" module>
  /** The feed's state. `ready` means whatever `usage` says is current. */
  export type UsageStatus = "ready" | "loading" | "error" | "unavailable";
</script>

<script lang="ts">
  import { usageRows, type UsageInput } from "./usage";

  /**
   * TD-76: the usage screen says which of these it is instead of rendering an
   * empty region. `null` usage used to render nothing at all, so "the engine
   * has not reported yet", "the feed failed" and "this run has no usage" all
   * looked identical - and a blank space reads as zero.
   */
  let {
    usage = null,
    status = "ready",
  }: {
    usage?: UsageInput | null;
    /** The feed's state, never inferred from `usage` being absent. */
    status?: UsageStatus;
  } = $props();

  const rows = $derived(usage ? usageRows(usage) : []);
</script>

<section
  class="usage"
  aria-label="Usage"
  aria-busy={status === "loading" ? "true" : undefined}
  data-testid="usage-view"
  data-state={status}
>
  {#if status === "loading"}
    <p role="status" data-testid="usage-loading">Loading usage…</p>
  {:else if status === "error"}
    <p role="alert" data-testid="usage-error">
      Usage could not be loaded - not zero.
    </p>
  {:else if status === "unavailable"}
    <p data-testid="usage-unavailable-note">
      Usage unavailable - no engine usage report.
    </p>
  {:else if usage === null}
    <p data-testid="usage-not-reported">
      Usage was not reported for this run - not zero.
    </p>
  {:else if rows.length === 0}
    <p data-testid="usage-unavailable">Usage unavailable - not zero.</p>
  {:else}
    <p class="semantics" data-testid="usage-semantics">
      {usage.semantics === "estimated" ? "Estimated usage" : "Reported usage"}
    </p>
    <dl>
      {#each rows as row (row.label)}
        <dt>{row.label}</dt>
        <dd>{row.value}</dd>
      {/each}
    </dl>
  {/if}
</section>
