import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import type { MemoryObservationRecord } from "@splyce/pi/contracts";
import MemoryList from "./MemoryList.svelte";
import type { MemoryEntry, MemoryStatus } from "../../stores/memory-view";

const entry = (id: string, over: Partial<MemoryEntry> = {}): MemoryEntry => ({
  observation: { observationId: id } as MemoryObservationRecord,
  claim: `claim ${id}`,
  source: "session s1",
  scope: "workspace",
  locality: "local",
  state: "active",
  ...over,
});

let cmp: ReturnType<typeof mount> | null = null;
afterEach(() => {
  if (cmp) unmount(cmp);
  cmp = null;
  document.body.innerHTML = "";
});
function render(
  entries: MemoryEntry[],
  onForget = vi.fn(async () => {}),
  status: MemoryStatus = "on",
) {
  cmp = mount(MemoryList, {
    target: document.body,
    props: { entries, onForget, status },
  });
  flushSync();
  return onForget;
}
const q = (s: string) => document.querySelector<HTMLElement>(s);
const button = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name,
  )!;

describe("MemoryList", () => {
  it("shows claim, source, scope and locality for local and cloud", () => {
    render([entry("m1"), entry("m2", { locality: "hosted" })]);
    const loc = [
      ...document.querySelectorAll('[data-testid="memory-locality"]'),
    ].map((n) => n.textContent);
    expect(loc).toEqual(["Local", "Cloud (hosted)"]);
    expect(document.body.textContent).toContain("session s1");
    expect(document.body.textContent).toContain("workspace");
  });

  it("empty states are honest per status", () => {
    render([]);
    expect(q('[data-testid="memory-empty"]')!.textContent).toContain(
      "Nothing is remembered yet",
    );
    unmount(cmp!);
    document.body.innerHTML = "";
    render([entry("m1")], undefined, "off");
    expect(q('[data-testid="memory-empty"]')!.textContent).toContain(
      "Memory is off",
    );
    unmount(cmp!);
    document.body.innerHTML = "";
    render([entry("m1")], undefined, "unavailable");
    expect(q('[data-testid="memory-empty"]')!.textContent).toContain(
      "unavailable",
    );
    expect(
      document.querySelectorAll('[data-testid="memory-item"]').length,
    ).toBe(0);
  });

  it("forget requires confirmation and is not called by the first click", async () => {
    const onForget = render([entry("m1")]);
    button("Forget").click();
    flushSync();
    expect(onForget).not.toHaveBeenCalled();
    expect(q('[role="alertdialog"]')).not.toBeNull();
    button("Cancel").click();
    flushSync();
    expect(onForget).not.toHaveBeenCalled();
    button("Forget").click();
    flushSync();
    button("Forget memory").click();
    await tick();
    flushSync();
    expect(onForget).toHaveBeenCalledWith("m1");
  });

  it("never claims deletion complete; shows pending until the engine says so", async () => {
    render([entry("m1")]);
    button("Forget").click();
    flushSync();
    button("Forget memory").click();
    await tick();
    flushSync();
    expect(q('[data-testid="memory-purge"]')!.textContent).toContain(
      "Waiting for the engine",
    );
    expect(document.body.textContent).not.toMatch(/deleted\.|forgotten\./i);
    expect(
      document.querySelectorAll('[data-testid="memory-item"]').length,
    ).toBe(1);
  });

  it("engine purge-pending differs from active", () => {
    render([entry("m1", { state: "purge-pending" })]);
    expect(q('[data-testid="memory-purge"]')!.textContent).toContain(
      "Purge pending",
    );
  });

  it("a failed forget is reported and keeps the item forgettable", async () => {
    render(
      [entry("m1")],
      vi.fn(async () => {
        throw new Error("engine offline");
      }),
    );
    button("Forget").click();
    flushSync();
    button("Forget memory").click();
    await tick();
    await tick();
    flushSync();
    expect(q('[role="alert"]')!.textContent).toContain("engine offline");
    expect(button("Forget")).toBeTruthy();
  });

  it("forget buttons have accessible names and the dialog focuses Cancel first", () => {
    render([entry("m1")]);
    expect(button("Forget").getAttribute("aria-label")).toBe(
      "Forget: claim m1",
    );
    button("Forget").click();
    flushSync();
    expect(q('[role="alertdialog"]')!.getAttribute("aria-label")).toBe(
      "Confirm forget",
    );
    expect(document.activeElement).toBe(button("Cancel"));
  });
});
