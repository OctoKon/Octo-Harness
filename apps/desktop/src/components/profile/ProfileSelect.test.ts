import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import ProfileSelect from "./ProfileSelect.svelte";
import type { ProfileAvailability } from "../../stores/profile-selection";

const mounted: object[] = [];
afterEach(() => {
  mounted.splice(0).forEach((c) => unmount(c));
  document.body.innerHTML = "";
});

function render(availability: ProfileAvailability, onSelect?: (r: unknown) => void) {
  mounted.push(
    mount(ProfileSelect, {
      target: document.body,
      props: { availability, onSelect },
    }),
  );
  flushSync();
}

function text(id: string): string {
  return document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? "";
}

const unreported: ProfileAvailability = {
  profiles: null,
  effective: null,
  requested: null,
};

const empty: ProfileAvailability = {
  profiles: [],
  effective: null,
  configRevision: "cfg1",
  requested: null,
};

const ready: ProfileAvailability = {
  profiles: [
    {
      profileId: "p1",
      profileRevision: "r1",
      bindings: [{ role: "chat", providerConnectionId: "conn_a", connectionRevision: "c1" }],
    },
  ],
  effective: null,
  configRevision: "cfg1",
  requested: null,
};

describe("profile select", () => {
  it("stays closed and says so when the feed has not reported", () => {
    render(unreported);
    expect(text("profile-status")).toContain("has not been reported");
    expect(document.querySelector("fieldset")?.hasAttribute("disabled")).toBe(true);
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(0);
  });

  it("states an empty feed honestly instead of showing a stale profile", () => {
    render(empty);
    expect(text("profile-status")).toContain("reported no profiles");
    expect(document.querySelector("fieldset")?.hasAttribute("disabled")).toBe(true);
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(0);
  });

  it("shows that nothing is applied instead of a default profile", () => {
    render(ready, () => {});
    expect(document.body.textContent).toContain("No profile is applied.");
    expect(text("profile-status")).toContain("No profile is applied.");
    expect(document.querySelector("fieldset")?.hasAttribute("disabled")).toBe(false);
  });

  it("disables Apply until a choice is made", () => {
    render(ready, () => {});
    const apply = document.querySelector<HTMLButtonElement>(
      'button[type="button"]',
    )!;
    expect(apply.disabled).toBe(true);
    document.querySelector<HTMLInputElement>('input[value="p1"]')!.click();
    flushSync();
    expect(apply.disabled).toBe(false);
  });

  it("hands the seam a compare-and-set request and does not invent a config revision", () => {
    const onSelect = vi.fn();
    render(ready, onSelect);
    document.querySelector<HTMLInputElement>('input[value="p1"]')!.click();
    flushSync();
    document.querySelector<HTMLButtonElement>('button[type="button"]')!.click();
    flushSync();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({
      profileId: "p1",
      profileRevision: "r1",
      expectedConfigRevision: "cfg1",
    });
  });

  it("shows pending and blocks selection while the engine has not applied the request", () => {
    const requested = {
      profileId: "p1",
      profileRevision: "r1",
      expectedConfigRevision: "cfg1",
    };
    render({
      profiles: ready.profiles,
      effective: null,
      configRevision: "cfg1",
      requested,
    });
    expect(text("profile-status")).toContain("Applying the profile");
    expect(document.querySelector("fieldset")?.hasAttribute("disabled")).toBe(true);
  });

  it("stops pending once the effective profile matches", () => {
    const requested = {
      profileId: "p1",
      profileRevision: "r1",
      expectedConfigRevision: "cfg1",
    };
    render({
      profiles: ready.profiles,
      effective: {
        profileId: "p1",
        profileRevision: "r1",
        configRevision: "cfg1",
      },
      configRevision: "cfg1",
      requested,
    });
    expect(text("profile-status")).not.toContain("Applying the profile");
    expect(document.body.textContent).toContain("Applied profile: p1");
  });

  it("renders bindings as role to connection text, never as a default label", () => {
    render(ready);
    expect(document.body.textContent).toContain("chat: conn_a");
  });
});