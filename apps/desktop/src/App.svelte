<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type {
    Handshake,
    PortAvailability,
    SplyceEvent,
  } from "@splyce/pi/contracts";
  import Composer from "./components/Composer.svelte";
  import SessionTree from "./components/SessionTree.svelte";
  import SessionActions from "./components/SessionActions.svelte";
  import TurnStream from "./components/TurnStream.svelte";
  import Shell from "./components/shell/Shell.svelte";
  import Sidebar, {
    type WorkbenchView,
  } from "./components/workbench/Sidebar.svelte";
  import MemoryList from "./components/memory/MemoryList.svelte";
  import ModelSwitcher from "./components/model/ModelSwitcher.svelte";
  import Icon from "../prototype/src/lib/Icon.svelte";
  import UsageView from "./components/usage/UsageView.svelte";
  import ApprovalSurface from "./components/ApprovalSurface.svelte";
  import PermissionModeSelect from "./components/PermissionModeSelect.svelte";
  import SupportStatus from "./components/SupportStatus.svelte";
  import Providers from "./routes/Providers.svelte";
  import Setup from "./routes/Setup.svelte";
  import Modules from "./routes/Modules.svelte";
  import { unavailableModuleSnapshot } from "./stores/modules";
  import type {
    ApprovalContext,
    ApprovalRequestView,
  } from "./stores/approvals";
  import {
    initialPermissionMode,
    type PermissionModeContext,
  } from "./stores/permission-mode";
  import {
    connectionState,
    cancelSession,
    handshake,
    invoke,
    onEvent,
    portAvailability,
    selectWorkspace,
    sendSetup,
    subscribe,
    type EngineConnectionState,
    type SelectedWorkspace,
  } from "./stores/engine";
  import {
    configuredProfileResult,
    isLoopbackUrl,
    profileSelectPayload,
    providerConfigurePayload,
    sessionStartPayload,
    setupErrorCopy,
    validateProfileSelectionResult,
    validateSessionStartResult,
    validateSetupReadResult,
    type ConfiguredProfile,
    type ProfileSelectionResult,
    type ProviderSetupDraft,
    type SessionStartResult,
  } from "./stores/profiles";
  import {
    bindSelection,
    clearSession,
    selectedSession,
    selectSession,
    type BindingStatus,
  } from "./stores/session-selection";
  import {
    createSessionNav,
    reduceSessionNav,
    visibleNodes,
    type SessionNavAction,
    type SessionNavState,
    type TreeEventLike,
  } from "./stores/sessions";
  import type { SessionActionsContext } from "./stores/session-actions";
  import {
    createTurnStreamTransport,
    createTurnsState,
    type TurnsState,
  } from "./stores/turns";

  type View =
    | "conversation"
    | "runs"
    | "memory"
    | "providers"
    | "modules"
    | "settings"
    | "setup"
    | "usage";
  const navigation: Record<WorkbenchView, View> = {
    work: "conversation",
    runs: "runs",
    memory: "memory",
    models: "providers",
    extensions: "modules",
    settings: "settings",
  };
  const viewLabels: Record<WorkbenchView, string> = {
    work: "Work",
    runs: "Runs",
    memory: "Memory",
    models: "Models",
    extensions: "Extensions",
    settings: "Settings",
  };
  // No setup/module service is connected: the screens stay honest and disabled
  // instead of implying a catalog, plan or installation.
  const moduleSnapshot = unavailableModuleSnapshot(
    "No setup or module service is connected.",
  );

  // TD-30: the turns store carries tool-call approvals for the inline
  // ApprovalCard, but no request carries the config/profile/policy revisions it
  // was issued against, and the dialog must not ask about a target it cannot
  // verify. The surface therefore shows only requests with a known revision:
  // there are none today, so the shell never claims an approval is pending.
  const approvalRequests: readonly ApprovalRequestView[] = [];
  const approvalContext: ApprovalContext = {
    engine: "unavailable",
    engineReason: "Session revisions are not delivered to the renderer yet.",
    sessionId: null,
    scopeId: null,
    runId: null,
    actionId: null,
    targetScope: null,
    normalizedTarget: null,
    revision: null,
    runCanceled: false,
    nowMs: 0,
  };

  // TD-30 Supervisor: a mode change is engine-admitted, and without the session
  // revisions it cannot be admitted at all. The selector is visibly disabled
  // with that reason instead of pretending a selection could take effect.
  const permissionContext: PermissionModeContext = {
    engine: "unavailable",
    engineReason: "Session revisions are not delivered to the renderer yet",
    configRevision: null,
    policyRevision: null,
  };

  // Snapshot seam: the only thing allowed to complete a session load. Readiness proves nothing about sessions.
  let {
    loadSessions,
  }: { loadSessions?: () => Promise<readonly SplyceEvent[]> } = $props();

  let view = $state<View>("conversation");
  let composerDraft = $state("");
  let composerPending = $state(false);
  let composerError = $state<string | null>(null);
  let profileCatalogStatus = $state<"loading" | "ready" | "error">("loading");
  function initialTheme(): "light" | "dark" {
    try {
      return localStorage.getItem("splyce.theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  }
  let theme = $state<"light" | "dark">(initialTheme());
  function toggleTheme() {
    theme = theme === "light" ? "dark" : "light";
    try {
      localStorage.setItem("splyce.theme", theme);
    } catch {
      /* Theme remains usable without preference storage. */
    }
  }
  $effect(() => {
    document.documentElement.dataset.theme = theme;
  });
  const navView = $derived<WorkbenchView>(
    view === "conversation"
      ? "work"
      : view === "providers"
        ? "models"
        : view === "modules"
          ? "extensions"
          : view === "setup" || view === "usage"
            ? "settings"
            : view,
  );
  let nav = $state.raw<SessionNavState>(createSessionNav());
  // sessionId -> scopeId, as carried by the engine's own events; never invented.
  const scopes = new Map<string, string>();
  const dispatchNav = (action: SessionNavAction) => {
    nav = untrack(() => reduceSessionNav(nav, action));
  };

  let status = $state<EngineConnectionState>("disconnected");
  let readiness = $state<Handshake["readiness"] | null>(null);
  let ports = $state<PortAvailability | null>(null);
  let startedSession = $state<SessionStartResult | null>(null);
  let sessionPortWitness = $state(false);
  let generationReady = $derived(
    ports === null || (startedSession !== null && !sessionPortWitness)
      ? undefined
      : ports.generation && ports.provider,
  );
  let engineConnected = $state(false);
  // Only the id and display name of the admitted project; never its path or selection ref.
  let workspace = $state<SelectedWorkspace | null>(null);
  let choosing = $state(false);
  let chooserError = $state<string | null>(null);
  let profiles = $state<ConfiguredProfile[]>([]);
  let profileSelection = $state<ProfileSelectionResult | null>(null);
  const selectedProfile = $derived(
    profiles.find(
      (profile) => profile.profileId === profileSelection?.selectedProfileId,
    ),
  );
  const providerLabel = $derived(
    selectedProfile?.endpointOrigin
      ? `${selectedProfile.endpointOrigin} · no automatic fallback`
      : "No provider selected · no automatic fallback",
  );
  let startReplay: {
    requestId: string;
    payload: ReturnType<typeof sessionStartPayload>;
  } | null = null;
  let activeRunId = $state<string | null>(null);
  let cancelPending = $state(false);
  let profilePending = $state(false);
  let configuring = $state(false);
  let profileStatus = $state<string | null>(null);
  let setupEpoch = 0;

  function invalidateSetup() {
    setupEpoch++;
    sessionPortWitness = false;
    startReplay = null;
    activeRunId = null;
    cancelPending = false;
    profiles = [];
    profileSelection = null;
    startedSession = null;
    profilePending = false;
    configuring = false;
    profileStatus = null;
  }
  const chooserReason = $derived(
    readiness?.state === "ready"
      ? null
      : "The engine is not connected. A project cannot be chosen yet.",
  );
  const providerUnavailable = $derived(
    profilePending || configuring
      ? "Provider setup is already in progress."
      : readiness?.state !== "ready"
        ? "The engine is not connected. Nothing can be saved."
        : workspace === null
          ? "Choose a project first. Provider setup is saved for a project."
          : undefined,
  );

  async function chooseProject() {
    if (choosing || chooserReason) return;
    choosing = true;
    chooserError = null;
    try {
      const chosen = await selectWorkspace();
      // Cancel (null) keeps the current project.
      if (chosen && chosen.workspaceId !== workspace?.workspaceId) {
        invalidateSetup();
        clearSession();
        workspace = chosen;
        void readSetup(chosen);
      }
    } catch {
      chooserError = "Could not open the project. Nothing changed.";
    } finally {
      choosing = false;
    }
  }

  async function readSetup(project: SelectedWorkspace) {
    const epoch = ++setupEpoch;
    const requestId = crypto.randomUUID();
    profileCatalogStatus = "loading";
    try {
      const result = validateSetupReadResult(
        await sendSetup("setup.read", requestId, {
          requestId,
          workspaceId: project.workspaceId,
        }),
      );
      if (epoch !== setupEpoch) return;
      profiles = result.profiles;
      profileCatalogStatus = "ready";
      profileSelection = result.selection;
      startedSession = null;
      profileStatus = "Saved profiles loaded. Start a session before sending.";
    } catch {
      if (epoch === setupEpoch) {
        profileStatus = "Saved profiles could not be loaded.";
        profileCatalogStatus = "error";
      }
    }
  }

  // The secret lives only in this one send; the payload object is not kept.
  async function configureProvider(draft: ProviderSetupDraft) {
    if (
      !workspace ||
      readiness?.state !== "ready" ||
      configuring ||
      profilePending
    )
      throw new Error("Setup unavailable");
    const project = workspace;
    const epoch = ++setupEpoch;
    configuring = true;
    profileSelection = null;
    startedSession = null;
    profileStatus = null;
    const requestId = crypto.randomUUID();
    try {
      const result = configuredProfileResult(
        await sendSetup(
          "provider.configure",
          requestId,
          providerConfigurePayload(draft, project.workspaceId, requestId),
        ),
      );
      if (epoch !== setupEpoch) throw { code: "WORKSPACE_SUPERSEDED" };
      profiles = [
        ...profiles
          .filter((p) => p.profileId !== result.profileId)
          .map((p) => ({ ...p, configRevision: result.configRevision })),
        result,
      ];
    } finally {
      if (epoch === setupEpoch) configuring = false;
    }
  }

  async function useProfile(profile: ConfiguredProfile) {
    if (
      !workspace ||
      readiness?.state !== "ready" ||
      profilePending ||
      configuring ||
      profile.credential === "missing"
    )
      return;
    const project = workspace;
    const epoch = ++setupEpoch;
    profilePending = true;
    sessionPortWitness = false;
    startReplay = null;
    activeRunId = null;
    profileSelection = null;
    startedSession = null;
    profileStatus = "Selecting profile…";
    try {
      const requestId = crypto.randomUUID();
      const selected = validateProfileSelectionResult(
        await sendSetup(
          "profile.select",
          requestId,
          profileSelectPayload(profile, project.workspaceId, requestId),
        ),
      );
      if (epoch !== setupEpoch) return;
      if (selected.selectedProfileId !== profile.profileId)
        throw new Error("Invalid selection");
      profileSelection = selected;
      clearSession();
      profiles = profiles.map((p) => ({
        ...p,
        configRevision: selected.configRevision,
        ...(p.profileId === selected.selectedProfileId && {
          profileRevision: selected.profileRevision,
        }),
      }));
      // A saved profile never proves session readiness. Only this native receipt can.
      profileStatus = "Starting session…";
      const startRequestId = crypto.randomUUID();
      const startPayload = sessionStartPayload(
        selected,
        project.workspaceId,
        startRequestId,
      );
      const started = validateSessionStartResult(
        await sendSetup("session.start", startRequestId, startPayload),
      );
      if (epoch !== setupEpoch) return;
      startedSession = started;
      startReplay = { requestId: startRequestId, payload: startPayload };
      if (started.readiness.state === "ready") {
        profileStatus = "Checking engine readiness…";
        try {
          const verified = await handshake();
          if (epoch !== setupEpoch) return;
          readiness = verified.readiness;
          sessionPortWitness = true;
          selectSession({
            sessionId: started.sessionId,
            scopeId: project.workspaceId,
          });
          profileStatus = "Profile selected. Session ready.";
        } catch {
          if (epoch !== setupEpoch) return;
          profileStatus =
            "Profile selected. Engine readiness could not be confirmed. Sending stays blocked.";
        }
      } else {
        profileStatus =
          "Profile selected. The session is unavailable. Sending stays blocked.";
      }
    } catch (error) {
      if (epoch === setupEpoch) {
        startedSession = null;
        profileStatus = profileSelection
          ? `Profile selected. Session could not be started. ${setupErrorCopy(error)}`
          : setupErrorCopy(error);
      }
    } finally {
      if (epoch === setupEpoch) profilePending = false;
    }
  }
  async function activateProfile(profile: ConfiguredProfile) {
    await useProfile(profile);
    if (
      status === "ready" &&
      profileSelection?.selectedProfileId === profile.profileId &&
      startedSession?.readiness.state === "ready"
    )
      view = "conversation";
  }

  function isOpaqueId(value: string) {
    return (
      !/[\uD800-\uDFFF]/u.test(value) &&
      value.length > 0 &&
      value.length <= 128 &&
      !/[\s\p{Cc}\p{Cf}\/\\]/u.test(value)
    );
  }

  async function refreshStaleSession(epoch: number) {
    const replay = startReplay;
    const previous = startedSession;
    sessionPortWitness = false;
    if (!replay || !previous) return;
    try {
      const refreshed = validateSessionStartResult(
        await sendSetup("session.start", replay.requestId, replay.payload),
      );
      if (
        epoch !== setupEpoch ||
        refreshed.sessionId !== previous.sessionId ||
        refreshed.sessionRevision !== previous.sessionRevision ||
        refreshed.readiness.state !== "ready"
      )
        return;
      const verified = await handshake();
      if (epoch !== setupEpoch) return;
      startedSession = refreshed;
      readiness = verified.readiness;
      sessionPortWitness = true;
      retry();
    } catch {
      if (epoch === setupEpoch)
        profileStatus =
          "Session readiness could not be refreshed. Sending stays blocked.";
    }
  }

  let stopped = $derived(engineConnected && status === "disconnected");
  let mounted = false;
  let turns = $state.raw<TurnsState>(createTurnsState());
  let subscription = $state<BindingStatus>({ state: "idle" });
  let retry = $state<() => void>(() => {});
  let currentRun = $derived(
    turns.currentRunId ? turns.runs[turns.currentRunId] : undefined,
  );
  // A different session starts on the safe mode: no mode or pending request
  // carries over from the previous one.
  const permissionModeState = $derived(
    initialPermissionMode($selectedSession?.sessionId ?? null),
  );

  // TD-33: the actions target the branch the tree actually selected. The engine
  // still does not deliver the revisions a lifecycle request needs, and a
  // rewind/code restore is not admitted yet, so every action is visibly disabled
  // with its own reason instead of pretending to run.
  const sessionActionContext: SessionActionsContext = $derived.by(() => {
    const key = nav.selectedKey;
    const node =
      key === null ? undefined : visibleNodes(nav).find((n) => n.key === key);
    return {
      engine: {
        status: "unavailable",
        reason: "Session revisions are not delivered to the renderer yet.",
      },
      rewind: {
        status: "unavailable",
        reason:
          "A rewind request is not admitted yet: TD-25 restore receipts are not wired.",
      },
      codeRestore: {
        status: "unavailable",
        reason:
          "Code restore is not available yet: TD-25 restore receipts are not wired.",
      },
      selected: node
        ? {
            sessionId: node.sessionId,
            branchAnchorId: node.branchAnchorId,
            leaves: node.leaves,
          }
        : null,
      draft: "",
    };
  });

  function applyTree(event: SplyceEvent) {
    if (event.kind !== "session.tree_updated") return;
    scopes.set(event.sessionId, event.scopeId);
    dispatchNav({ type: "event", event: event as TreeEventLike });
  }

  async function runLoad() {
    dispatchNav({ type: "refresh" });
    try {
      for (const event of await loadSessions!()) applyTree(event);
      dispatchNav({ type: "loaded" });
    } catch (e) {
      dispatchNav({
        type: "failed",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Readiness never completes a load: without a snapshot the previous navigation state is kept, selection included.
  $effect(() => {
    if (status === "ready") {
      if (loadSessions) void runLoad();
      else if (untrack(() => Object.keys(nav.branches).length > 0))
        dispatchNav({ type: "loaded" });
    } else if (status === "unavailable" || status === "error")
      dispatchNav({ type: "failed", message: "Engine unavailable." });
  });

  function onSelect(key: string) {
    dispatchNav({ type: "select", key });
    const node = visibleNodes(nav).find((n) => n.key === key);
    const scopeId = node && scopes.get(node.sessionId);
    if (node && startedSession && node.sessionId !== startedSession.sessionId) {
      startedSession = null;
      profileStatus =
        "Readiness has not been reported for the selected session.";
    }
    if (node && scopeId) selectSession({ sessionId: node.sessionId, scopeId });
  }

  // The selected branch vanished from the latest snapshot: drop the selection with it.
  $effect(() => {
    if (nav.lostSelection) clearSession();
  });

  function canRespond(actionId: string) {
    return (
      !!workspace &&
      !!profileSelection &&
      !!startedSession &&
      (status === "ready" || status === "busy") &&
      subscription.state === "live" &&
      !turns.stale &&
      !turns.needsResync &&
      $selectedSession?.sessionId === startedSession.sessionId &&
      $selectedSession?.scopeId === workspace.workspaceId &&
      currentRun?.actions.some(
        (action) =>
          action.actionId === actionId &&
          action.approval?.state === "requested",
      ) === true
    );
  }

  async function onApproval(
    approvalRequestId: string,
    runId: string,
    actionId: string,
    decision: "approve" | "deny",
  ) {
    const project = workspace;
    const selected = profileSelection;
    const session = startedSession;
    if (
      !project ||
      !selected ||
      !session ||
      currentRun?.runId !== runId ||
      !canRespond(actionId) ||
      !currentRun.actions.some(
        (action) =>
          action.actionId === actionId &&
          action.approval?.approvalRequestId === approvalRequestId &&
          action.approval.runId === runId,
      )
    )
      throw new Error("Approval unavailable");
    await invoke(
      "approval.respond",
      { approvalRequestId, runId, actionId, decision },
      {
        sessionId: session.sessionId,
        scopeId: project.workspaceId,
        expectedConfigRevision: selected.configRevision,
        expectedProfileRevision: selected.profileRevision,
        expectedPolicyRevision: session.policyRevision,
      },
    );
  }

  async function connect() {
    invalidateSetup();
    readiness = null;
    try {
      const verified = await handshake();
      if (!mounted) return;
      readiness = status === "disconnected" ? null : verified.readiness;
      engineConnected = true;
      if (workspace && readiness?.state === "ready") void readSetup(workspace);
    } catch {
      // The engine store publishes the unavailable/error state.
    }
  }

  onMount(() => {
    mounted = true;
    // This component is the workbench: the only writer of the session-selection store.
    const transport = createTurnStreamTransport({
      onState: (next) => {
        turns = next;
        if (
          activeRunId &&
          ["completed", "failed", "canceled", "stopped"].includes(
            next.runs[activeRunId]?.status ?? "",
          )
        )
          activeRunId = null;
      },
      onResync: (fromSeq, sessionId) => {
        void binding.resubscribe(sessionId, fromSeq);
      },
    });
    const binding = bindSelection(transport, subscribe);
    const unsubState = connectionState.subscribe((val) => {
      status = val;
      if (val === "disconnected") {
        invalidateSetup();
        readiness = null;
        ports = null;
      }
    });
    const unsubPorts = portAvailability.subscribe((val) => {
      ports = val;
    });
    const unsubBinding = binding.status.subscribe((next) => {
      subscription = next;
    });
    retry = () => void binding.retry();
    const unsubEvents = onEvent((event) => {
      applyTree(event);
      transport.enqueue(event);
    });

    void connect();

    return () => {
      mounted = false;
      setupEpoch++;
      unsubState();
      unsubPorts();
      unsubEvents();
      unsubBinding();
      binding.dispose();
      transport.dispose();
      clearSession();
    };
  });
</script>

<div
  data-testid="app-shell"
  data-connection-state={status}
  data-readiness-policy={readiness ? readiness.policy : "unknown"}
  data-readiness-store={readiness ? readiness.store : "unknown"}
  data-readiness-receipts={readiness ? readiness.receipts : "unknown"}
  data-readiness-generation={ports ? ports.generation : "unknown"}
>
  <Shell
    {rail}
    {transcript}
    composer={emptyComposer}
    {evidence}
    showComposer={false}
    quietToolbar
    contentLabel={viewLabels[navView]}
  />
</div>

{#snippet emptyComposer()}{/snippet}

{#snippet rail(onFold: () => void)}
  <Sidebar
    view={navView}
    onNavigate={(next) => (view = navigation[next])}
    workspaceLabel={workspace?.displayName ?? null}
    {choosing}
    {chooserReason}
    {chooserError}
    onChooseWorkspace={() => void chooseProject()}
    {theme}
    onToggleTheme={toggleTheme}
    engineLabel={readiness?.state === "ready" &&
    status !== "disconnected" &&
    status !== "error" &&
    !stopped
      ? "Pi engine · local"
      : "Engine unavailable"}
    {providerLabel}
    runCount={Object.keys(turns.runs).length}
    {onFold}
  />
{/snippet}

{#snippet connectionNotice()}
  {#if status !== "ready"}
    <section
      class="connection-note"
      data-testid="unavailable-banner"
      role="status"
      aria-live="polite"
    >
      <h2>
        {stopped
          ? "Engine stopped"
          : status !== "error" &&
              status !== "disconnected" &&
              readiness?.state === "ready"
            ? "Generation unconfigured"
            : "Engine Unavailable"}
      </h2>
      <p>
        {stopped
          ? "The native engine exited. Reconnect to resume or restart the app; the last transcript may be incomplete."
          : status !== "error" &&
              status !== "disconnected" &&
              readiness?.state === "ready"
            ? "Choose a project, configure a provider, and start a session to begin."
            : status === "connecting"
              ? "The engine is connecting. Task execution stays unavailable until its native services are ready."
              : "The engine is unavailable. Reconnect to restore its native services."}
      </p>
      {#if stopped || status === "error" || status === "unavailable" || status === "disconnected"}
        <button type="button" class="text-action" onclick={() => void connect()}
          >Retry</button
        >
      {:else if readiness?.state === "ready"}
        <button
          type="button"
          class="text-action"
          onclick={() => (view = "providers")}>Open setup</button
        >
      {/if}
    </section>
  {/if}
{/snippet}

{#snippet transcript()}
  <ApprovalSurface requests={approvalRequests} context={approvalContext} />
  {#if subscription.state === "failed"}
    <div class="subscribe-error" role="alert" data-testid="subscribe-error">
      <span>Could not subscribe to the session: {subscription.error}</span
      ><button type="button" onclick={retry}>Retry</button>
    </div>
  {/if}
  {#if view === "conversation"}
    <div class={currentRun ? "conversation-page" : "page work-page"}>
      <div class:work-stage={!currentRun}>
        {#if currentRun}
          <header class="page-heading">
            <div>
              <p class="eyebrow">Work</p>
              <h1>{workspace?.displayName ?? "Current session"}</h1>
            </div>
            <span class="connection-chip">{status}</span>
          </header>
          {@render connectionNotice()}
          <section class="turn-pane" aria-label="Transcript">
            <TurnStream
              run={currentRun}
              stale={turns.stale ||
                turns.needsResync ||
                (status !== "ready" && status !== "busy")}
              {canRespond}
              {onApproval}
            />
          </section>
        {:else}
          <h1 class="work-motto">
            Barebones by default.<br />Modular by choice.<br /><em
              >Evidence by design.</em
            >
          </h1>
        {/if}
        <div class={currentRun ? "conversation-composer" : "work-composer"}>
          {@render composer()}
        </div>
        {#if !currentRun}
          {@render connectionNotice()}
          {#if generationReady}<p class="workspace-view">
              Ready for workspace execution.
            </p>{/if}
          <section class="work-recents" aria-labelledby="recents-label">
            <h2 class="recents-label" id="recents-label">Recents</h2>
            {#if startedSession}
              <button
                class="recent-row"
                type="button"
                onclick={() => (view = "runs")}
                ><span
                  class="recent-status"
                  data-status={startedSession.readiness.state}
                  aria-hidden="true"
                ></span><span class="recent-copy"
                  ><span class="recent-title">Current session</span><span
                    class="recent-meta"
                    >{workspace?.displayName ?? "Selected project"} · {startedSession
                      .readiness.state}</span
                  ></span
                ><span class="recent-arrow"
                  ><Icon name="arrow-right" size={13} /></span
                ></button
              >
            {:else}<p class="empty-recents">
                Recent session history is not available yet.
              </p>{/if}
          </section>
          <div class="work-hint">
            <span
              ><Icon name="shield" size={11} /> Policy checked before dispatch</span
            ><span><Icon name="lock" size={11} /> {providerLabel}</span>
          </div>
        {/if}
      </div>
    </div>
  {:else if view === "runs"}
    <div class="page detail-page">
      <header class="page-heading">
        <div>
          <p class="eyebrow">Workspace history</p>
          <h1>Runs</h1>
          <p>Sessions and their recorded ancestry.</p>
        </div>
      </header>
      <SessionTree
        {nav}
        {onSelect}
        canRetry={status === "ready"}
        onFocus={(key) => dispatchNav({ type: "focus", key })}
        onMove={(to) => dispatchNav({ type: "move", to })}
        onRetry={() => {
          if (status === "ready" && loadSessions) void runLoad();
        }}
      />
      {#if startedSession}<button
          class="text-action"
          type="button"
          onclick={() => (view = "conversation")}>Open current session</button
        >{/if}
      <SessionActions context={sessionActionContext} />
    </div>
  {:else if view === "memory"}
    <div class="page detail-page">
      <header class="page-heading">
        <div>
          <p class="eyebrow">Workspace knowledge</p>
          <h1>Memory</h1>
          <p>Remembered items retain their source and scope.</p>
        </div>
      </header>
      <MemoryList
        entries={[]}
        status="unavailable"
        onForget={async () => {
          throw new Error("Memory unavailable");
        }}
      />
    </div>
  {:else if view === "providers"}
    <div class="page detail-page providers" data-testid="providers-view">
      <header class="page-heading">
        <div>
          <p class="eyebrow">Connections and profiles</p>
          <h1>Models</h1>
          <p>Choose the provider and model for your work.</p>
        </div>
      </header>
      <fieldset
        class="model-selection"
        disabled={profilePending || activeRunId !== null}
      >
        <ModelSwitcher
          selection={{
            currentRef:
              startedSession?.readiness.state === "ready"
                ? (profileSelection?.selectedProfileId ?? "No active model")
                : "No active model",
            transition: null,
          }}
          options={profiles.map((profile) => ({
            ref: profile.profileId,
            label: profile.modelId ?? profile.profileId,
            locality:
              profile.endpointOrigin && isLoopbackUrl(profile.endpointOrigin)
                ? "local"
                : "hosted",
            unavailableReason:
              profile.credential === "missing"
                ? "Credential missing"
                : undefined,
          }))}
          catalogStatus={workspace ? profileCatalogStatus : "error"}
          onRequest={(ref) => {
            if (activeRunId || profilePending) return;
            const profile = profiles.find((item) => item.profileId === ref);
            if (profile) void activateProfile(profile);
          }}
        />
      </fieldset>
      {#if activeRunId}<p role="status">
          Finish or cancel the current turn before switching models.
        </p>{/if}
      <Providers
        connections={[]}
        families={[]}
        {profiles}
        workspaceSelected={workspace !== null}
        selectedProfileId={profileSelection?.selectedProfileId ?? null}
        selectProfile={activateProfile}
        {profilePending}
        {profileStatus}
        credentialSubmit={providerUnavailable ? undefined : configureProvider}
        credentialUnavailable={providerUnavailable}
      />
      <SupportStatus cells={null} />
    </div>
  {:else if view === "modules"}
    <div class="page detail-page">
      <header class="page-heading">
        <div>
          <p class="eyebrow">Optional capabilities</p>
          <h1>Extensions</h1>
          <p>Install and enable only the capabilities you choose.</p>
        </div>
      </header>
      <Modules
        snapshot={moduleSnapshot}
        onConfigureProvider={() => (view = "providers")}
      />
    </div>
  {:else if view === "setup"}
    <div class="page detail-page">
      <header class="page-heading"><div><h1>Setup</h1></div></header>
      <Setup
        snapshot={moduleSnapshot}
        onEnterWorkbench={() => (view = "conversation")}
        onOpenModules={() => (view = "modules")}
        onConfigureProvider={() => (view = "providers")}
      />
    </div>
  {:else if view === "usage"}
    <div class="page detail-page">
      <header class="page-heading"><div><h1>Usage</h1></div></header>
      <UsageView usage={null} status="unavailable" />
    </div>
  {:else}
    <div class="page detail-page">
      <header class="page-heading">
        <div>
          <p class="eyebrow">Application preferences</p>
          <h1>Settings</h1>
          <p>Appearance, permissions, setup, and reported usage.</p>
        </div>
      </header>
      <section class="settings-card">
        <h2>Appearance</h2>
        <button type="button" class="text-action" onclick={toggleTheme}
          >Use {theme === "light" ? "dark" : "light"} theme</button
        >
      </section>
      <section
        class="settings-card supervisor"
        aria-label="Supervisor"
        data-testid="supervisor"
      >
        <h2>Supervisor</h2>
        <PermissionModeSelect
          modeState={permissionModeState}
          context={permissionContext}
        />
      </section>
      <section class="settings-card">
        <h2>Setup and modules</h2>
        <button
          type="button"
          class="text-action"
          onclick={() => (view = "setup")}>Setup</button
        ><button
          type="button"
          class="text-action"
          onclick={() => (view = "modules")}>Manage extensions</button
        >
      </section>
      <UsageView usage={null} status="unavailable" />
    </div>
  {/if}
{/snippet}

{#snippet composer()}
  <Composer
    bind:draft={composerDraft}
    bind:pending={composerPending}
    bind:error={composerError}
    workspaceLabel={workspace?.displayName ?? null}
    modelLabel={selectedProfile?.modelId ??
      (profileSelection ? "Selected profile" : null)}
    onChooseWorkspace={chooserReason === null && !choosing
      ? () => void chooseProject()
      : undefined}
    onConfigureModel={() => (view = "providers")}
    connection={status}
    sessionId={startedSession?.sessionId ?? $selectedSession?.sessionId ?? null}
    {generationReady}
    workspaceSelected={workspace !== null}
    profileSelected={profileSelection !== null}
    sessionReadiness={startedSession?.readiness.state}
    stale={turns.stale || turns.needsResync}
    unavailable={subscription.state !== "live" ||
    $selectedSession?.sessionId !== startedSession?.sessionId ||
    $selectedSession?.scopeId !== workspace?.workspaceId
      ? "Session subscription is unavailable. Sending stays blocked."
      : activeRunId
        ? "A turn is running."
        : undefined}
    cancellable={activeRunId !== null && !cancelPending}
    cancel={async () => {
      if (!startedSession || !activeRunId || cancelPending) return;
      const epoch = setupEpoch;
      const sessionId = startedSession.sessionId;
      const runId = activeRunId;
      cancelPending = true;
      try {
        await cancelSession(sessionId);
        if (epoch === setupEpoch && activeRunId === runId) activeRunId = null;
      } catch {
        if (epoch === setupEpoch)
          profileStatus = "Cancellation could not be confirmed.";
      } finally {
        if (epoch === setupEpoch) cancelPending = false;
      }
    }}
    send={async (payload) => {
      const project = workspace;
      const selected = profileSelection;
      const session = startedSession;
      const epoch = setupEpoch;
      if (
        !project ||
        !selected ||
        !session ||
        status !== "ready" ||
        generationReady !== true ||
        subscription.state !== "live" ||
        !sessionPortWitness ||
        turns.stale ||
        turns.needsResync ||
        $selectedSession?.sessionId !== session.sessionId ||
        $selectedSession?.scopeId !== project.workspaceId
      )
        throw new Error("Session unavailable");
      try {
        const result = await invoke("session.prompt", payload, {
          sessionId: session.sessionId,
          scopeId: project.workspaceId,
          expectedConfigRevision: selected.configRevision,
          expectedProfileRevision: selected.profileRevision,
          expectedPolicyRevision: session.policyRevision,
        });
        if (
          result === null ||
          typeof result !== "object" ||
          Array.isArray(result) ||
          Object.keys(result).length !== 3 ||
          (result as { accepted?: unknown }).accepted !== true ||
          typeof (result as { runId?: unknown }).runId !== "string" ||
          !isOpaqueId((result as { runId: string }).runId) ||
          typeof (result as { turnId?: unknown }).turnId !== "string" ||
          !isOpaqueId((result as { turnId: string }).turnId)
        )
          throw new Error("Invalid acknowledgement");
        if (epoch !== setupEpoch) throw new Error("Session changed");
        const runId = (result as { runId: string }).runId;
        if (
          !["completed", "failed", "canceled", "stopped"].includes(
            turns.runs[runId]?.status ?? "",
          )
        )
          activeRunId = runId;
      } catch (error) {
        if (
          epoch === setupEpoch &&
          error !== null &&
          typeof error === "object" &&
          Object.hasOwn(error, "code") &&
          (error as { code?: unknown }).code === "STALE_REVISION"
        )
          void refreshStaleSession(epoch);
        throw error;
      }
    }}
  />
  {#if ports && !ports.workspace}<p class="tools-note" role="status">
      Workspace tools unavailable
    </p>{/if}
{/snippet}

{#snippet evidence()}<p>No changes or evidence available.</p>{/snippet}

<style>
  .work-page {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .work-stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-bottom: 6vh;
  }
  .work-motto {
    max-width: 720px;
    margin: 0 auto 28px;
    font-family: var(--serif);
    font-size: clamp(32px, 4.2vw, 56px);
    font-weight: 400;
    line-height: 1.06;
    letter-spacing: -0.018em;
    text-align: center;
    transform: translateY(-30px);
  }
  .work-motto em {
    font-style: italic;
  }
  .work-recents {
    width: min(100%, 720px);
    margin: 0 auto;
    border: 1px solid var(--border);
    border-radius: var(--r-xl);
    background: var(--neutral);
    overflow: hidden;
  }
  .recents-label {
    margin: 0;
    padding: 12px 15px 9px;
    font-size: 10px;
    font-weight: 500;
    line-height: 14px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .recent-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 15px;
    border-top: 1px solid var(--border);
    text-align: left;
    transition: background 0.15s;
  }
  .recent-row:hover {
    background: var(--surface);
  }
  .recent-row:focus-visible {
    /* keep the ring inside the card, whose overflow clips outside outlines */
    outline-offset: -3px;
    border-radius: var(--r-sm);
  }
  .recent-status {
    width: 6px;
    height: 6px;
    border-radius: var(--r-full);
    background: var(--dot-idle);
    flex: none;
  }
  .recent-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .recent-title {
    overflow: hidden;
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
    color: var(--on-surface);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .recent-meta {
    overflow: hidden;
    font-size: 11px;
    line-height: 14px;
    color: var(--text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .recent-arrow {
    display: grid;
    place-items: center;
    color: var(--text-faint);
    flex: none;
  }
  .recent-row:hover .recent-arrow {
    color: var(--on-surface);
  }
  .work-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    flex-wrap: wrap;
    padding: 10px 2px 0;
    font-size: 11px;
    color: var(--text-faint);
  }
  .work-hint span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  @media (min-width: 821px) {
    .work-stage {
      padding-top: 6vh;
      padding-bottom: 0;
    }
  }

  .work-stage {
    min-height: calc(100vh - 70px);
    padding: 60px 24px 28px;
  }
  .work-composer {
    width: min(100%, 920px);
    margin: 0 auto 28px;
  }
  .work-recents {
    margin-top: 4px;
  }
  .empty-recents {
    padding: 12px 15px;
    color: var(--text-muted);
    font-size: 12px;
    margin: 0;
  }
  .connection-note {
    width: min(100%, 720px);
    margin: 0 auto 24px;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: 12px 15px;
    background: var(--surface);
    font-size: 12px;
    color: var(--text-muted);
  }
  .connection-note h2 {
    font-family: var(--font);
    font-size: 12px;
    font-weight: 600;
    line-height: 18px;
    margin: 0 0 4px;
    color: var(--on-surface);
  }
  .connection-note p {
    margin: 0 0 6px;
  }
  .text-action {
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 7px 12px;
    background: var(--neutral);
    color: var(--on-surface);
    font-weight: 500;
    cursor: pointer;
  }
  .text-action:hover {
    background: var(--surface);
  }
  .text-action:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
  }
  .detail-page {
    max-width: 1020px;
    width: 100%;
    margin: 0 auto;
    padding: 36px 44px 60px;
  }
  .page-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
  }
  .page-heading h1 {
    font-family: var(--serif);
    font-size: 36px;
    line-height: 1.15;
    font-weight: 400;
    letter-spacing: -0.02em;
    margin: 0 0 8px;
  }
  .page-heading p {
    color: var(--text-muted);
    margin: 0;
    font-size: 13px;
  }
  .page-heading .eyebrow {
    font-size: 10px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    margin-bottom: 8px;
    color: var(--text-faint);
  }
  .connection-chip {
    font-size: 11px;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: var(--r-full);
    padding: 4px 9px;
  }
  .settings-card {
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: 20px;
    margin-bottom: 20px;
    background: var(--neutral);
  }
  .settings-card h2 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 14px;
  }
  .settings-card .text-action + .text-action {
    margin-left: 8px;
  }
  .model-selection {
    border: 0;
    padding: 0;
    margin: 0 0 24px;
    min-width: 0;
  }
  .tools-note {
    font-size: 11px;
    color: var(--text-muted);
    margin: 8px 0 0;
    text-align: center;
  }
  .workspace-view {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0 auto 16px;
  }
  .conversation-page {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    padding: 20px 36px;
    max-width: 1160px;
    margin: auto;
  }
  .conversation-page .connection-note {
    width: 100%;
  }
  .turn-pane {
    flex: 1;
    min-height: 120px;
    overflow-wrap: anywhere;
  }
  .conversation-composer {
    position: sticky;
    bottom: 0;
    background: var(--neutral);
    padding-top: 16px;
  }
  .subscribe-error {
    padding: 12px 20px;
    color: var(--error);
    overflow-wrap: anywhere;
  }
  @media (max-width: 720px) {
    .detail-page {
      padding: 32px 20px;
    }
    .work-stage {
      padding: 48px 18px 24px;
    }
    .work-motto {
      transform: none;
      font-size: 36px;
      margin-bottom: 28px;
    }
    .conversation-page {
      padding: 20px;
    }
  }
</style>
