import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import {
  SUPPORT_STATUSES,
  supportView,
  type SupportCell,
} from "./status-labels";
import { projectStatus, projectToolStatus } from "./status-view";
import StatusLabel from "./components/StatusLabel.svelte";
import SupportStatus from "./components/SupportStatus.svelte";

const mounted: object[] = [];
function render(c: object, props: Record<string, unknown>) {
  const target = document.createElement("div");
  document.body.append(target);
  mounted.push(mount(c as never, { target, props }));
  flushSync();
  return target;
}
afterEach(() => {
  mounted.splice(0).forEach((c) => unmount(c));
  document.body.innerHTML = "";
});

describe("supportView", () => {
  it("maps every enum value to a distinct fixed label", () => {
    const labels = SUPPORT_STATUSES.map((s) => supportView(s).label);
    expect(labels).toEqual([
      "Supported",
      "Unsupported",
      "Unavailable",
      "Unknown",
    ]);
    expect(new Set(labels).size).toBe(SUPPORT_STATUSES.length);
  });

  it.each([
    undefined,
    null,
    "",
    "tested",
    "SUPPORTED",
    "toString",
    "__proto__",
    1,
    {},
  ])("never shows %j as supported", (raw) => {
    const v = supportView(raw);
    expect(v.label).toBe("Unknown");
    expect(v.tone).toBe("unknown");
  });

  it("reuses the shared status-view Unknown instead of its own table", () => {
    expect(supportView("unknown")).toBe(projectStatus("run", null));
  });
});

describe("StatusLabel", () => {
  it("renders a projectStatus label as text, with role=status only when live", () => {
    const view = projectToolStatus("uncertain");
    const el = render(StatusLabel, { view }).querySelector("span")!;
    expect(el.textContent).toBe("Uncertain");
    expect(el.getAttribute("role")).toBeNull();
    const live = render(StatusLabel, { view, live: true }).querySelector(
      "span",
    )!;
    expect(live.getAttribute("role")).toBe("status");
  });
});

describe("SupportStatus", () => {
  it("shows the honest empty state when no record is delivered", () => {
    for (const cells of [null, []]) {
      const t = render(SupportStatus, { cells });
      expect(t.querySelector("[role=status]")?.textContent).toMatch(
        /No support record available/,
      );
      expect(t.querySelector("table")).toBeNull();
      expect(t.textContent).not.toMatch(/Supported/);
    }
  });

  it("renders each cell with text status and n=0 for unrun cells", () => {
    const cells: SupportCell[] = [
      { id: "a", label: "Windows 11 x64", status: "supported", runs: 3 },
      { id: "b", label: "Windows 10", status: "unsupported", runs: 0 },
      { id: "c", label: "Windows ARM", status: "unavailable" },
      { id: "d", label: "Other", status: "bogus" as never, runs: 2 },
    ];
    const t = render(SupportStatus, { cells });
    const rows = [...t.querySelectorAll("tbody tr")].map((r) =>
      [...r.children].map((c) => c.textContent?.trim()),
    );
    expect(rows).toEqual([
      ["Windows 11 x64", "Supported", "n=3"],
      ["Windows 10", "Unsupported", "n=0"],
      ["Windows ARM", "Unavailable", "not reported"],
      ["Other", "Unknown", "n=2"],
    ]);
    expect(t.querySelector("th[scope=row]")?.textContent).toBe(
      "Windows 11 x64",
    );
  });
});
