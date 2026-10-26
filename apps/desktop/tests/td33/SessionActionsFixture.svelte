<script lang="ts">
  /**
   * TD-33 e2e host for the session lifecycle actions (D4_session_resume_fork).
   *
   * It plays the parent the app will provide: it owns the editor text and the
   * request executor, and it can hold a request so the busy/cancel path is
   * observable. The component itself never invokes the engine.
   */
  import { onMount } from "svelte";
  import SessionActions from "../../src/components/SessionActions.svelte";
  import type {
    SessionActionRequest,
    SessionActionsContext,
  } from "../../src/stores/session-actions";

  type Call = { readonly name: string; readonly args: readonly unknown[] };
  type Selection = "a" | "b" | "none";
  type Mode = "hold" | "succeed" | "fail";

  const ANCESTRY = {
    a: {
      sessionId: "ses_1",
      branchAnchorId: "anchor_1",
      leaves: ["e1", "e2"],
    },
    b: {
      sessionId: "ses_1",
      branchAnchorId: "anchor_2",
      leaves: ["e3"],
    },
  } as const;

  let status = $state<"ready" | "unavailable">("ready");
  let engineReason = $state<string | null>(null);
  let rewindStatus = $state<"ready" | "unavailable">("ready");
  let rewindReason = $state<string | null>(null);
  let codeStatus = $state<"ready" | "unavailable">("unavailable");
  let codeReason = $state<string | null>(
    "Code restore is not available yet: TD-25 restore receipts are not wired.",
  );
  let selection = $state<Selection>("a");
  let draft = $state("start draft");
  let mode = $state<Mode>("hold");

  const calls: Call[] = [];
  const requests: SessionActionRequest[] = [];
  let pendingResolve: (() => void) | null = null;
  let pendingReject: ((error: Error) => void) | null = null;

  const context = $derived<SessionActionsContext>({
    engine: { status, reason: engineReason },
    rewind: { status: rewindStatus, reason: rewindReason },
    codeRestore: { status: codeStatus, reason: codeReason },
    selected: selection === "none" ? null : { ...ANCESTRY[selection] },
    draft,
  });

  async function request(next: SessionActionRequest) {
    requests.push(next);
    if (mode === "succeed") return;
    if (mode === "fail") throw new Error("Engine refused the request.");
    await new Promise<void>((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
    });
  }

  function release() {
    pendingResolve?.();
    pendingResolve = null;
  }

  function fail(message: string) {
    pendingReject?.(new Error(message));
    pendingReject = null;
  }

  function setEngine(next: "ready" | "unavailable", reason: string | null) {
    status = next;
    engineReason = reason;
  }

  function setRewind(next: "ready" | "unavailable", reason: string | null) {
    rewindStatus = next;
    rewindReason = reason;
  }

  function setCodeRestore(
    next: "ready" | "unavailable",
    reason: string | null,
  ) {
    codeStatus = next;
    codeReason = reason;
  }

  function setSelection(next: Selection) {
    selection = next;
  }

  function setMode(next: Mode) {
    mode = next;
  }

  function restoreDraft(text: string) {
    calls.push({ name: "onRestoreDraft", args: [text] });
    draft = text;
  }

  onMount(() => {
    (
      window as unknown as {
        __td33: {
          calls: () => readonly Call[];
          requests: () => readonly SessionActionRequest[];
          setEngine: typeof setEngine;
          setRewind: typeof setRewind;
          setCodeRestore: typeof setCodeRestore;
          setSelection: typeof setSelection;
          setMode: typeof setMode;
          release: typeof release;
          fail: typeof fail;
        };
      }
    ).__td33 = {
      calls: () => calls.map((call) => ({ ...call })),
      requests: () => requests.map((next) => ({ ...next })),
      setEngine,
      setRewind,
      setCodeRestore,
      setSelection,
      setMode,
      release,
      fail,
    };
  });
</script>

<label for="editor">Message</label>
<textarea id="editor" data-testid="editor" bind:value={draft}></textarea>

<SessionActions {context} onRequest={request} onRestoreDraft={restoreDraft} />

<button id="behind" data-testid="behind" type="button">Behind the modal</button>
