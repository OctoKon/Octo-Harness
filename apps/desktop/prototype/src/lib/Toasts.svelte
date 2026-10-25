<script lang="ts">
  import { fly } from 'svelte/transition';
  import { app } from './state.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="toasts" aria-live="polite" aria-atomic="false">
  {#each app.toasts as toast (toast.id)}
    <div class="toast" transition:fly={{ y: 10, duration: 180 }}>
      <span class="tick"><Icon name="check" size={9} stroke={2.6} /></span>
      {toast.message}
    </div>
  {/each}
</div>
