<script lang="ts">
  import type { DiffFile } from './types';
  import Icon from './Icon.svelte';

  let {
    files,
    comments = {},
    oncomment,
  }: {
    files: DiffFile[];
    comments?: Record<string, string>;
    oncomment?: (key: string, path: string, line: number, text: string) => void;
  } = $props();

  let active = $state<string | null>(null);
  let draft = $state('');

  const keyOf = (path: string, number: number, index: number) => `${path}:${number}:${index}`;

  function open(key: string) {
    active = key;
    draft = '';
  }

  function save(key: string, path: string, line: number) {
    if (!draft.trim()) return;
    oncomment?.(key, path, line, draft.trim());
    active = null;
    draft = '';
  }
</script>

{#each files as file (file.path)}
  <div class="file-head" style="margin-top:10px">
    <Icon name="file" size={13} />
    <span class="name">{file.path}</span>
    <span class="add">+{file.additions}</span>
    <span class="del">−{file.deletions}</span>
  </div>
  <div class="diff">
    {#each file.hunks as hunk (hunk.header)}
      <div class="hunk">{hunk.header}</div>
      {#each hunk.lines as line, index (index)}
        {@const key = keyOf(file.path, line.number, index)}
        <div class="dline {line.kind}" onclick={() => open(key)} role="presentation">
          <span class="ln">{line.number}</span>
          <span class="code"
            >{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}{line.text}</span
          >
        </div>
        {#if comments[key]}
          <div class="cmt"><b>You</b> · {comments[key]}</div>
        {/if}
        {#if active === key}
          <div class="cmt-form">
            <input
              bind:value={draft}
              placeholder="Comment on this line…"
              aria-label="Comment on line {line.number}"
              onkeydown={(event) => {
                if (event.key === 'Enter') save(key, file.path, line.number);
                if (event.key === 'Escape') active = null;
              }}
            />
            <button
              class="btn sm secondary"
              type="button"
              onclick={() => save(key, file.path, line.number)}
            >
              Add
            </button>
          </div>
        {/if}
      {/each}
    {/each}
  </div>
{/each}
