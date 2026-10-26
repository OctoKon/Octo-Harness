import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";

// The only fake: the native IPC boundary. Stores, transport and components are real.
const ipc = vi.hoisted(() => ({
  ready: false,
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc.invoke }));

import App from "./App.svelte";
import { dispatchEngineEvent } from "./stores/engine";
import { FOUNDATION, PI_REVISION } from "@splyce/pi/contracts";
import { clearSession, selectedSession } from "./stores/session-selection";

const settle = () => new Promise((r) => setTimeout(r, 0));
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const button = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name,
  )!;
const subscribes = () =>
  ipc.invoke.mock.calls.filter(([c]) => c === "subscribe");

let app: object | undefined;
const handshake = {
  protocolVersion: 1,
  schemaVersion: 1,
  engineProtocolVersion: 1,
  bridgeProtocolVersion: 1,
  piRevision: PI_REVISION,
  entryMode: FOUNDATION.entryMode,
  disabledBuiltinExtensions: [...FOUNDATION.disabledBuiltinExtensions],
  readiness: { state: "ready", policy: true, store: true, receipts: true },
};
beforeEach(() => {
  ipc.ready = false;
  ipc.invoke.mockImplementation(async (cmd: string) => {
    if (cmd !== "handshake") return undefined;
    if (!ipc.ready) throw new Error("no native backend");
    return handshake;
  });
  window.innerWidth = 1400;
  ipc.invoke.mockClear();
  clearSession();
});
afterEach(() => {
  if (app) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
});

async function boot() {
  app = mount(App, { target: document.body });
  await settle();
}

const treeEvent = (sessionId: string, scopeId: string) =>
  ({
    kind: "session.tree_updated",
    sessionId,
    scopeId,
    seq: 1,
    payload: { sessionId, branchAnchorId: "b1", leaves: ["e1"] },
  }) as never;

describe("App wiring", () => {
  it("shows an unavailable, disabled composer when no session is selected", async () => {
    await boot();
    expect(q("[data-testid=unavailable-banner]")).not.toBeNull();
    expect(q("#composer-status")?.textContent).toMatch(
      /not connected|unavailable|error/i,
    );
    expect(button("Send").disabled).toBe(true);
    // Sessions never read as empty or loading while the engine is down.
    expect(q("[data-testid=session-tree]")?.textContent).toMatch(
      /could not be loaded/,
    );
    expect(get(selectedSession)).toBeNull();
  });

  it("mounts each surface from shell navigation", async () => {
    await boot();
    button("Providers").click();
    flushSync();
    const providers = q("[data-testid=providers-view]") as HTMLFieldSetElement;
    expect(providers).not.toBeNull();
    expect(providers.disabled).toBe(true);
    expect(q("#providers-title")?.textContent).toBe("Provider connections");

    button("Usage").click();
    flushSync();
    expect(q("[data-testid=usage-unavailable-note]")).not.toBeNull();
    expect(q("[data-testid=providers-view]")).toBeNull();

    button("Conversation").click();
    flushSync();
    expect(q("[data-testid=unavailable-banner]")).not.toBeNull();
  });

  it("selecting a session follows and subscribes exactly once, and the composer binds to it", async () => {
    ipc.ready = true;
    await boot();
    dispatchEngineEvent(treeEvent("ses_1", "scope_1"));
    await settle();
    const item = q("[role=treeitem]")!;
    expect(item).not.toBeNull();
    item.click();
    await settle();
    item.click(); // re-selecting keeps the channel
    await settle();

    expect(get(selectedSession)).toEqual({
      sessionId: "ses_1",
      scopeId: "scope_1",
    });
    expect(subscribes()).toHaveLength(1);
    expect(subscribes()[0][1]).toMatchObject({ sessionId: "ses_1" });
    // Composer now sees a session; sending stays disabled for an honest reason.
    expect(q("#composer-status")?.textContent).not.toMatch(
      /No session is selected/,
    );
    expect(button("Send").disabled).toBe(true);
  });
});
