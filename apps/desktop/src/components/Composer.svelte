<script lang="ts">
  import {
    buildPrompt,
    keyAction,
    sendBlockedReason,
    type PromptPayload,
  } from "../stores/composer";
  import type { EngineConnectionState } from "../stores/engine";

  /**
   * Fixed copy for a rejected send. The rejection itself is never shown: it can
   * carry filesystem paths, secrets or stack frames, and the UI cannot know
   * whether the engine received the prompt before the failure.
   */
  const SEND_UNCERTAIN =
    "The message may not have reached the engine. Check the connection, then resend.";

  let {
    connection,
    sessionId,
    stale = false,
    generationReady,
    unavailable,
    cancellable = false,
    contextArtifactIds = [],
    send,
    cancel,
  }: {
    connection: EngineConnectionState;
    sessionId: string | null;
    stale?: boolean;
    /** Engine-reported generation readiness; fail closed when false. */
    generationReady?: boolean;
    unavailable?: string;
    cancellable?: boolean;
    contextArtifactIds?: readonly string[];
    send: (payload: PromptPayload) => Promise<void>;
    cancel?: () => void | Promise<void>;
  } = $props();

  let draft = $state("");
  let pending = $state(false);
  let composing = $state(false);
  let error = $state<string | null>(null);

  const reason = $derived(
    sendBlockedReason({
      connection,
      sessionId,
      stale,
      generationReady,
      pending,
      unavailable,
    }),
  );
  const payload = $derived(buildPrompt(draft, contextArtifactIds));

  async function submit() {
    // Guard on live state: a handler may run before derived values re-render.
    if (pending || sendBlockedReason({
      connection,
      sessionId,
      stale,
      generationReady,
      pending,
      unavailable,
    }))
      return;
    const request = buildPrompt(draft, contextArtifactIds);
    if (!request) return;
    pending = true;
    error = null;
    try {
      await send(request);
      draft = "";
    } catch {
      // Never echo the rejection: it can carry paths, secrets or stack text.
      // A rejected promise does not prove the engine ignored the message.
      error = SEND_UNCERTAIN;
    } finally {
      pending = false;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    const action = keyAction(e, composing);
    if (action === "send") {
      e.preventDefault();
      void submit();
    } else if (action === "cancel" && cancellable && cancel) {
      e.preventDefault();
      void cancel();
    }
  }
</script>

<form
  class="composer"
  aria-label="Composer"
  onsubmit={(e) => {
    e.preventDefault();
    void submit();
  }}
>
  <label for="composer-input">Message</label>
  <textarea
    id="composer-input"
    rows="3"
    bind:value={draft}
    {onkeydown}
    oncompositionstart={() => (composing = true)}
    oncompositionend={() => (composing = false)}
    aria-describedby="composer-status"
  ></textarea>
  <p id="composer-status" role="status">
    {#if error}Send failed: {error}{:else if reason}{reason}{/if}
  </p>
  <button type="submit" disabled={reason !== null || payload === null}>
    Send
  </button>
  {#if cancellable && cancel}
    <button type="button" onclick={() => void cancel?.()}>Cancel turn</button>
  {/if}
</form>

<style>
  textarea:focus-visible,
  button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
</style>
