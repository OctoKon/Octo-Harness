import { describe, expect, it } from "vitest";
import { statusLabel, statusLabels } from "./status-labels";

describe("statusLabel", () => {
  it("maps known statuses to projectStatus labels", () => {
    expect(statusLabel("pending")).toBe("Pending");
    expect(statusLabel("running")).toBe("Running");
    expect(statusLabel("completed")).toBe("Completed");
    expect(statusLabel("failed")).toBe("Failed");
    expect(statusLabel("streaming")).toBe("Working");
    expect(statusLabel("waiting-approval")).toBe("Waiting for approval");
    expect(statusLabel("success")).toBe("Success");
  });

  it("returns Unknown for unknown or prototype keys", () => {
    expect(statusLabel("nope")).toBe("Unknown");
    expect(statusLabel("constructor")).toBe("Unknown");
    expect(statusLabel("__proto__")).toBe("Unknown");
    expect(statusLabel(null)).toBe("Unknown");
    expect(statusLabel(42)).toBe("Unknown");
  });

  it("memoizes results", () => {
    expect(statusLabel("approved")).toBe("Approved");
    expect(statusLabels()).toHaveProperty("approved", "Approved");
  });
});
