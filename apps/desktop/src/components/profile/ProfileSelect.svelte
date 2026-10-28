<script lang="ts">
  import {
    canSelect,
    knownConfigRevision,
    profileSummary,
    selectionRequest,
    statusLine,
    type ProfileAvailability,
    type ProfileSelectionRequest,
    type ProfileView,
  } from "../../stores/profile-selection";

  let {
    availability,
    onSelect,
  }: {
    availability: ProfileAvailability;
    /** Injected once the profile commands exist; omitted means selection is closed. */
    onSelect?: (request: ProfileSelectionRequest) => void;
  } = $props();

  let chosen = $state<string | null>(null);

  const open = $derived(canSelect(availability) && onSelect !== undefined);
  const line = $derived(statusLine(availability));
  const profiles = $derived(availability.profiles ?? []);
  const picked = $derived(
    profiles.find((p) => p.profileId === chosen) ?? null,
  );

  function apply() {
    if (!open || picked === null) return;
    const request = selectionRequest(picked, knownConfigRevision(availability));
    if (request === null) return;
    onSelect?.(request);
  }

  function summary(profile: ProfileView): string {
    return profileSummary(profile);
  }
</script>

<section class="profiles" aria-labelledby="profile-select-title">
  <h3 id="profile-select-title">Provider profile</h3>
  {#if availability.effective}
    <p data-testid="profile-effective">
      Applied profile: <code>{availability.effective.profileId}</code>
      (config {availability.effective.configRevision})
    </p>
  {:else}
    <p data-testid="profile-effective">No profile is applied.</p>
  {/if}

  <fieldset disabled={!open}>
    <legend>Apply a profile</legend>
    {#if profiles.length === 0}
      <p data-testid="profile-list-empty">No profiles are listed.</p>
    {:else}
      {#each profiles as profile (profile.profileId)}
        <label class="profile">
          <input
            type="radio"
            name="profile"
            value={profile.profileId}
            bind:group={chosen}
            disabled={!open}
          />
          <code>{profile.profileId}</code>
          <span class="summary">{summary(profile)}</span>
        </label>
      {/each}
      <button type="button" onclick={apply} disabled={!open || picked === null}>
        Apply profile
      </button>
    {/if}
  </fieldset>

  {#if line}
    <p role="status" data-testid="profile-status">{line}</p>
  {/if}
</section>

<style>
  .profiles {
    border: 1px solid currentColor;
    padding: 0.5rem;
    margin: 0.5rem 0;
  }
  .profile {
    display: block;
    margin: 0.25rem 0;
  }
  .summary {
    display: block;
    font-size: 0.875rem;
  }
  button {
    margin-top: 0.5rem;
  }
</style>
