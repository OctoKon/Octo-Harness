<script lang="ts">
  import ConnectionCard from "../components/provider/ConnectionCard.svelte";
  import CredentialForm from "../components/provider/CredentialForm.svelte";
  import CustomEndpointForm from "../components/provider/CustomEndpointForm.svelte";
  import {
    groupByFamily,
    type ConnectionInput,
    type CustomEndpointDraft,
    type ProviderSetupDraft,
  } from "../stores/profiles";

  let {
    connections,
    families,
    onAddCustom,
    credentialSubmit,
    credentialUnavailable,
  }: {
    connections: readonly ConnectionInput[];
    families: readonly string[];
    /** Omitted while no profile service is connected: the form stays disabled with its reason. */
    onAddCustom?: (draft: CustomEndpointDraft) => void;
    /** Injected once the native setup route is available; omitted means unavailable. */
    credentialSubmit?: (draft: ProviderSetupDraft) => Promise<void>;
    credentialUnavailable?: string;
  } = $props();

  const groups = $derived(groupByFamily(connections, families));
  const existing = $derived(
    connections.map((c) => ({
      id: c.record.providerConnectionId,
      endpointLabel: c.endpointLabel,
    })),
  );
</script>

<main aria-labelledby="providers-title">
  <h2 id="providers-title">Provider connections</h2>
  <CredentialForm submit={credentialSubmit} unavailableReason={credentialUnavailable} />
  {#each groups as group (group.apiFamily)}
    <section aria-labelledby={`fam-${group.apiFamily}`} data-testid="family">
      <h3 id={`fam-${group.apiFamily}`}>{group.apiFamily}</h3>
      {#if group.connections.length === 0}
        <p>No connections configured.</p>
      {:else}
        <ul>
          {#each group.connections as connection (connection.id)}
            <ConnectionCard {connection} />
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
  <fieldset class="custom" disabled={!onAddCustom}>
    {#if !onAddCustom}
      <p>Custom endpoints are unavailable: no profile service is connected.</p>
    {/if}
    <CustomEndpointForm {existing} onAdd={(draft) => onAddCustom?.(draft)} />
  </fieldset>
</main>

<style>
  .custom { border: 0; margin: 0; padding: 0; }
</style>
