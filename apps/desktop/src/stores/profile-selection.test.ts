import { describe, expect, it } from "vitest";
import {
  PROFILE_EMPTY,
  PROFILE_NONE,
  PROFILE_NO_CONFIG,
  PROFILE_PENDING,
  PROFILE_UNREPORTED,
  canSelect,
  isApplied,
  knownConfigRevision,
  selectionRequest,
  selectionState,
  statusLine,
} from "./profile-selection";
import type {
  EffectiveProfileView,
  ProfileAvailability,
  ProfileView,
} from "./profile-selection";

const profile = (id = "p1"): ProfileView => ({
  profileId: id,
  profileRevision: "r1",
  bindings: [{ role: "chat", providerConnectionId: "conn_a", connectionRevision: "c1" }],
});

const effective = (id = "p1"): EffectiveProfileView => ({
  profileId: id,
  profileRevision: "r1",
  configRevision: "cfg1",
});

describe("profile selection state", () => {
  it("is unreported when the feed has never reported, distinct from empty", () => {
    const a: ProfileAvailability = {
      profiles: null,
      effective: null,
      requested: null,
    };
    expect(selectionState(a)).toBe("unreported");
    expect(statusLine(a)).toBe(PROFILE_UNREPORTED);
    expect(canSelect(a)).toBe(false);
  });

  it("an empty reported list is 'none', not unreported and not ready", () => {
    const a: ProfileAvailability = {
      profiles: [],
      effective: null,
      configRevision: "cfg1",
      requested: null,
    };
    expect(selectionState(a)).toBe("none");
    expect(statusLine(a)).toBe(PROFILE_EMPTY);
    expect(canSelect(a)).toBe(false);
  });

  it("is pending only while a request is outstanding and not applied", () => {
    const a: ProfileAvailability = {
      profiles: [profile()],
      effective: null,
      configRevision: "cfg1",
      requested: {
        profileId: "p1",
        profileRevision: "r1",
        expectedConfigRevision: "cfg1",
      },
    };
    expect(selectionState(a)).toBe("pending");
    expect(statusLine(a)).toBe(PROFILE_PENDING);
    expect(canSelect(a)).toBe(false);
  });

  it("is applied when the effective profile matches the request", () => {
    const req = {
      profileId: "p1",
      profileRevision: "r1",
      expectedConfigRevision: "cfg1",
    };
    const a: ProfileAvailability = {
      profiles: [profile()],
      effective: effective(),
      configRevision: "cfg1",
      requested: req,
    };
    expect(isApplied(req, effective())).toBe(true);
    expect(selectionState(a)).toBe("ready");
    expect(statusLine(a)).toBeNull();
    expect(canSelect(a)).toBe(true);
  });

  it("a mismatched effective profile keeps the selector pending", () => {
    const req = {
      profileId: "p1",
      profileRevision: "r1",
      expectedConfigRevision: "cfg1",
    };
    const other = { profileId: "p2", profileRevision: "r2", configRevision: "cfg1" };
    const a: ProfileAvailability = {
      profiles: [profile(), profile("p2")],
      effective: other,
      configRevision: "cfg1",
      requested: req,
    };
    expect(isApplied(req, other)).toBe(false);
    expect(selectionState(a)).toBe("pending");
  });

  it("never claims a profile is applied when effective is null", () => {
    const a: ProfileAvailability = {
      profiles: [profile()],
      effective: null,
      configRevision: "cfg1",
      requested: null,
    };
    expect(selectionState(a)).toBe("ready");
    expect(statusLine(a)).toBe(PROFILE_NONE);
  });

  it("cannot select without a known config revision", () => {
    const a: ProfileAvailability = {
      profiles: [profile()],
      effective: null,
      requested: null,
    };
    expect(knownConfigRevision(a)).toBeNull();
    expect(canSelect(a)).toBe(false);
    expect(statusLine(a)).toBe(PROFILE_NO_CONFIG);
  });

  it("unavailable is an explicit state, not inferred from empty data", () => {
    const a: ProfileAvailability = {
      profiles: [profile()],
      effective: effective(),
      configRevision: "cfg1",
      requested: null,
      unavailable: "Profile feed is disabled.",
    };
    expect(selectionState(a)).toBe("unavailable");
    expect(statusLine(a)).toBe("Profile feed is disabled.");
    expect(canSelect(a)).toBe(false);
  });

  it("builds a compare-and-set request from a known config revision", () => {
    expect(selectionRequest(profile(), "cfg1")).toEqual({
      profileId: "p1",
      profileRevision: "r1",
      expectedConfigRevision: "cfg1",
    });
    expect(selectionRequest(profile(), null)).toBeNull();
  });

  it("does not invent a config revision from a profile id", () => {
    const a: ProfileAvailability = {
      profiles: [profile()],
      effective: effective(),
      requested: null,
    };
    // effective is present, so its revision is usable; no profile-derived fallback.
    expect(knownConfigRevision(a)).toBe("cfg1");
  });
});