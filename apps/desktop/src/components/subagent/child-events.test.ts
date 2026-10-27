import { describe, expect, it } from "vitest";
import {
  applyChildEvent,
  createSubagentChildren,
  parseCitation,
  toSubagentChild,
} from "./child-events";

const started = {
  kind: "child.started",
  payload: { runId: "run-1", childId: "child-1", mode: "write" },
} as const;

const progress = {
  kind: "child.progress",
  payload: { runId: "run-1", childId: "child-1", turns: 2, tokens: 1200 },
} as const;

const completed = {
  kind: "child.completed",
  payload: {
    runId: "run-1",
    childId: "child-1",
    summary: "Added the retry helper.",
    citations: ["apps/desktop/src/lib/retry.ts:4", "README.md"],
    files: ["added apps/desktop/src/lib/retry.ts"],
  },
} as const;

describe("subagent child events", () => {
  it("tracks a child from started through progress to completed", () => {
    let state = applyChildEvent(createSubagentChildren(), started);
    expect(state.children["child-1"]).toMatchObject({
      childId: "child-1",
      runId: "run-1",
      mode: "write",
      status: "running",
      turns: 0,
      tokens: 0,
    });

    state = applyChildEvent(state, progress);
    expect(state.children["child-1"]).toMatchObject({
      status: "running",
      turns: 2,
      tokens: 1200,
    });

    state = applyChildEvent(state, completed);
    expect(state.children["child-1"]).toMatchObject({
      status: "completed",
      summary: "Added the retry helper.",
      citations: ["apps/desktop/src/lib/retry.ts:4", "README.md"],
      files: ["added apps/desktop/src/lib/retry.ts"],
    });
  });

  it("never regresses a terminal child on late progress", () => {
    let state = applyChildEvent(createSubagentChildren(), started);
    state = applyChildEvent(state, completed);
    state = applyChildEvent(state, progress);

    expect(state.children["child-1"]?.status).toBe("completed");
    expect(state.children["child-1"]?.turns).toBe(0);
  });

  it("records failed and cancelled children without rendering a raw message", () => {
    let state = applyChildEvent(createSubagentChildren(), started);
    state = applyChildEvent(state, {
      kind: "child.failed",
      payload: {
        runId: "run-1",
        childId: "child-1",
        reason: "CAPABILITY_DENIED",
        message: "C:\\private\\raw failure",
      },
    });
    expect(state.children["child-1"]).toMatchObject({
      status: "failed",
      failureReason: "CAPABILITY_DENIED",
    });
    expect(JSON.stringify(state)).not.toContain("C:\\\\private");

    state = applyChildEvent(state, {
      kind: "child.cancelled",
      payload: { runId: "run-1", childId: "child-1", cleanedUp: true },
    });
    expect(state.children["child-1"]).toMatchObject({
      status: "cancelled",
      cleanedUp: true,
    });
  });

  it("starts a fresh view when a child id is reused by another run", () => {
    let state = applyChildEvent(createSubagentChildren(), completed);
    state = applyChildEvent(state, started);

    expect(state.children["child-1"]).toMatchObject({
      runId: "run-1",
      status: "running",
    });
    expect(state.children["child-1"]?.summary).toBeUndefined();

    state = applyChildEvent(state, {
      kind: "child.started",
      payload: { runId: "run-2", childId: "child-1", mode: "read" },
    });
    expect(state.children["child-1"]).toMatchObject({
      runId: "run-2",
      mode: "read",
      status: "running",
    });
  });

  it("projects the view model into the merge-back child with parsed citations", () => {
    let state = applyChildEvent(createSubagentChildren(), started);
    state = applyChildEvent(state, completed);
    const child = toSubagentChild(state.children["child-1"]!);

    expect(child).toMatchObject({
      childId: "child-1",
      parentRunId: "run-1",
      status: "completed",
      summary: "Added the retry helper.",
      citations: [
        { path: "apps/desktop/src/lib/retry.ts", line: 4 },
        { path: "README.md", line: 0 },
      ],
    });
  });

  it("parses a path-only citation and a Windows path with a trailing line", () => {
    expect(parseCitation("README.md")).toEqual({ path: "README.md", line: 0 });
    expect(parseCitation("C:\\work\\src\\retry.ts:12")).toEqual({
      path: "C:\\work\\src\\retry.ts",
      line: 12,
    });
    expect(parseCitation("src\\retry.ts:0")).toEqual({
      path: "src\\retry.ts:0",
      line: 0,
    });
  });
});
