<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    eyebrow,
    title,
    sub,
    children,
  }: {
    eyebrow?: string;
    title: string;
    sub?: string;
    children?: Snippet;
  } = $props();
</script>

<header class="page-head">
  <div>
    {#if eyebrow}<div class="eyebrow">{eyebrow}</div>{/if}
    <h1>{title}</h1>
    {#if sub}<p class="sub">{sub}</p>{/if}
  </div>
  {#if children}<div class="actions">{@render children()}</div>{/if}
</header>
