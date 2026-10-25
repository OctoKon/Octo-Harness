<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    tone = '',
    dot = false,
    live = false,
    children,
  }: {
    tone?: '' | 'err' | 'ink' | 'outline';
    dot?: boolean;
    live?: boolean;
    children?: Snippet;
  } = $props();
</script>

<span class="chip {tone}">
  {#if dot}<span class="dot" class:live></span>{/if}
  {@render children?.()}
</span>
