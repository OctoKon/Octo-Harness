import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, unmount } from "svelte";
import Sidebar, { type WorkbenchView } from "./Sidebar.svelte";

const mounted: object[] = [];
afterEach(() => {
  mounted.splice(0).forEach((component) => unmount(component));
  document.body.innerHTML = "";
});

function setup(overrides = {}) {
  const callbacks = {
    onNavigate: vi.fn<(view: WorkbenchView) => void>(),
    onChooseWorkspace: vi.fn(),
    onToggleTheme: vi.fn(),
    onFold: vi.fn(),
  };
  mounted.push(
    mount(Sidebar, {
      target: document.body,
      props: {
        view: "work",
        workspaceLabel: null,
        choosing: false,
        chooserReason: null,
        chooserError: null,
        theme: "light",
        engineLabel: "Engine disconnected",
        providerLabel: "No provider selected",
        runCount: 0,
        ...callbacks,
        ...overrides,
      },
    }),
  );
  const button = (label: string) =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  return { ...callbacks, button };
}

describe("native workbench sidebar", () => {
  it("routes every navigation control through the supplied callback", () => {
    const s = setup();
    const views: WorkbenchView[] = [
      "work",
      "runs",
      "memory",
      "models",
      "extensions",
      "settings",
    ];
    for (const view of views)
      s.button(view[0].toUpperCase() + view.slice(1)).click();
    expect(s.onNavigate.mock.calls.map(([view]) => view)).toEqual(views);
    s.button("Go to Work").click();
    expect(s.onNavigate).toHaveBeenLastCalledWith("work");
    expect(s.button("Work").getAttribute("aria-current")).toBe("page");
    expect(s.onChooseWorkspace).not.toHaveBeenCalled();
  });

  it("preserves native chooser, fold and theme callbacks without inventing readiness", () => {
    const s = setup({ chooserError: "Project selection cancelled." });
    s.button("Choose project").click();
    s.button("Collapse sidebar").click();
    s.button("Switch to dark theme").click();
    expect(s.onChooseWorkspace).toHaveBeenCalledOnce();
    expect(s.onFold).toHaveBeenCalledOnce();
    expect(s.onToggleTheme).toHaveBeenCalledOnce();
    expect(
      document.querySelector('[data-testid="project-name"]')?.textContent,
    ).toContain("No project selected.");
    expect(document.querySelector("#project-status")?.textContent).toBe(
      "Project selection cancelled.",
    );
    expect(document.body.textContent).toContain("Engine disconnected");
    expect(document.body.textContent).toContain("No provider selected");
    expect(document.body.textContent).not.toContain("Pi engine · local");
  });

  it("shows selected project, count and errors as text and prevents duplicate choosing", () => {
    const s = setup({
      workspaceLabel: "<script>project</script>",
      choosing: true,
      chooserError: "Access denied",
      theme: "dark",
      runCount: 3,
    });
    expect(s.button("Choose project").disabled).toBe(true);
    s.button("Choose project").click();
    expect(s.onChooseWorkspace).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-testid="project-name"]')?.textContent,
    ).toContain("<script>project</script>");
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("#project-status")?.textContent).toBe(
      "Choosing project…",
    );
    expect(document.querySelector('[aria-label="3 runs"]')?.textContent).toBe(
      "3",
    );
    expect(s.button("Switch to light theme")).toBeTruthy();
  });

  it("exposes native chooser failures", () => {
    setup({ chooserError: "Access denied" });
    expect(document.querySelector("#project-status")?.textContent).toBe(
      "Access denied",
    );
  });

  it("keeps project selection disabled while the native engine is unavailable", () => {
    const s = setup({ chooserReason: "The engine is not connected." });
    expect(s.button("Choose project").disabled).toBe(true);
    s.button("Choose project").click();
    expect(s.onChooseWorkspace).not.toHaveBeenCalled();
  });
});
