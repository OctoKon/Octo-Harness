<script lang="ts">
  import {
    createCommandRegistry,
    type CommandHandler,
  } from "../../stores/commands";
  import CommandPalette from "./CommandPalette.svelte";

  interface Props {
    /** Admitted action handlers keyed by catalog id; palette.open is supplied here. */
    handlers: Readonly<Record<string, CommandHandler>>;
    scopeLabel: string;
  }
  let { handlers, scopeLabel }: Props = $props();

  let open = $state(false);
  // Handlers are read at call time so a changed prop is never stale.
  const registry = createCommandRegistry(
    new Proxy(
      {
        "palette.open": {
          run: () => {
            open = true;
          },
        },
      } as Record<string, CommandHandler>,
      { get: (own, id: string) => own[id] ?? handlers[id], has: () => true },
    ),
  );
</script>

<svelte:window onkeydown={(e) => registry.handleKey(e)} />
<CommandPalette {registry} bind:open {scopeLabel} />
