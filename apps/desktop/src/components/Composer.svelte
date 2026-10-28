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
    workspaceSelected = false,
    profileSelected = false,
    sessionReadiness,
    unavailable,
    cancellable = false,
    contextArtifactIds = [],
    send,
    cancel,
    draft = $bindable(""),
    pending = $bindable(false),
    error = $bindable<string | null>(null),
    workspaceLabel = null,
    modelLabel = null,
    baseLabel = "Not reported",
    onChooseWorkspace,
    onConfigureModel,
  }: {
    connection: EngineConnectionState;
    sessionId: string | null;
    stale?: boolean;
    /** Engine-reported generation readiness; fail closed when false. */
    generationReady?: boolean;
    /** A project is selected; sending is blocked without one. */
    workspaceSelected?: boolean;
    profileSelected?: boolean;
    sessionReadiness?: "ready" | "unavailable";
    unavailable?: string;
    cancellable?: boolean;
    contextArtifactIds?: readonly string[];
    send: (payload: PromptPayload) => Promise<void>;
    cancel?: () => void | Promise<void>;
    draft?: string;
    pending?: boolean;
    error?: string | null;
    workspaceLabel?: string | null;
    modelLabel?: string | null;
    baseLabel?: string;
    onChooseWorkspace?: () => void;
    onConfigureModel?: () => void;
  } = $props();

  let composing = $state(false);

  const reason = $derived(
    sendBlockedReason({
      connection,
      sessionId,
      stale,
      generationReady,
      workspaceSelected,
      profileSelected,
      sessionReadiness,
      pending,
      unavailable,
    }),
  );
  const payload = $derived(buildPrompt(draft, contextArtifactIds));

  async function submit() {
    // Guard on live state: a handler may run before derived values re-render.
    if (
      pending ||
      sendBlockedReason({
        connection,
        sessionId,
        stale,
        generationReady,
        workspaceSelected,
        profileSelected,
        sessionReadiness,
        pending,
        unavailable,
      })
    )
      return;
    const submittedDraft = draft;
    const request = buildPrompt(submittedDraft, contextArtifactIds);
    if (!request) return;
    pending = true;
    error = null;
    try {
      await send(request);
      if (draft === submittedDraft) draft = "";
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
  <label class="sr-only" for="composer-input">Message</label>
  <div class="c-top">
    <textarea
      id="composer-input"
      rows="2"
      bind:value={draft}
      {onkeydown}
      oncompositionstart={() => (composing = true)}
      oncompositionend={() => (composing = false)}
      aria-describedby="composer-status"
      placeholder="Describe the task, the acceptance test, and anything that must not change…"
    ></textarea>
    <button
      type="submit"
      class="btn-send"
      aria-label="Send"
      disabled={reason !== null || payload === null}
    >
      <span class="sr-only">Send</span>
      <svg
        aria-hidden="true"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg
      >
    </button>
  </div>
  <div class="c-bottom">
    <button
      class="chip"
      type="button"
      disabled={!onChooseWorkspace}
      onclick={onChooseWorkspace}
      ><span>workspace</span> {workspaceLabel ?? "Not reported"}</button
    >
    <span class="chip"><span>base</span> {baseLabel}</span>
    <button
      class="chip"
      type="button"
      disabled={!onConfigureModel}
      onclick={onConfigureModel}
      ><span>runtime</span> {modelLabel ?? "Not reported"}</button
    >
    <span class="hint">Enter to start · Shift+Enter for a line</span>
    {#if cancellable && cancel}
      <button type="button" class="btn-cancel" onclick={() => void cancel?.()}
        >Cancel turn</button
      >
    {/if}
  </div>
  <p
    id="composer-status"
    role="status"
    class:has-error={!!error}
    class:is-blocked={!!reason}
  >
    {#if error}Send failed: {error}{:else if reason}{reason}{/if}
  </p>
</form>

<style>
  .composer {
    border: 1px solid var(--border, #d1d5db);
    border-radius: var(--r-xl, 16px);
    background: var(--neutral, #fff);
    padding: 6px 6px 6px 18px;
  }
  .composer:focus-within {
    border-color: var(--primary, #111);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .c-top {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  textarea {
    flex: 1;
    min-width: 0;
    min-height: 52px;
    max-height: 160px;
    padding: 12px 0 4px;
    border: 0;
    background: transparent;
    color: var(--on-surface, #111);
    resize: vertical;
    font: inherit;
    font-size: 16px;
    line-height: 24px;
  }
  textarea::placeholder {
    color: var(--text-faint, #737373);
  }
  textarea:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--focus, var(--primary, #111));
    outline-offset: 2px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .btn-send {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: var(--primary, #111);
    color: var(--primary-contrast, #fff);
    display: grid;
    place-items: center;
    flex: none;
    margin: 6px 4px 0 0;
  }
  .btn-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .c-bottom {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    padding: 2px 10px 2px 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 28px;
    padding: 4px 9px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted, #666);
    font-size: 12px;
    font-weight: 500;
  }
  .chip span {
    color: var(--text-faint, #737373);
  }
  button.chip:hover:not(:disabled) {
    background: var(--surface, #f5f5f5);
    color: var(--on-surface, #111);
  }
  button.chip:disabled {
    cursor: default;
  }
  .hint {
    margin-left: auto;
    padding: 4px 9px;
    color: var(--text-muted, #666);
    font-size: 11px;
  }
  .btn-cancel {
    border: 1px solid var(--status-danger, #b91c1c);
    border-radius: 6px;
    background: transparent;
    color: var(--status-danger, #b91c1c);
    padding: 4px 9px;
  }
  #composer-status {
    margin: 0;
    padding: 0 9px 2px 0;
    color: var(--text-muted, #666);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  #composer-status:empty {
    display: none;
  }
  #composer-status.has-error {
    color: var(--status-danger, #b91c1c);
    font-weight: 500;
  }
  #composer-status.is-blocked {
    color: var(--status-warning, #b45309);
  }
</style>
