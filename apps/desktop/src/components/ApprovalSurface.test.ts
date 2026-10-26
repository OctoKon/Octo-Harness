import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import ApprovalSurfaceHarness from "../../tests/td30/ApprovalSurfaceHarness.svelte";
import { approvalMatching, approvalRequest } from "../../tests/td30/fixtures";
import type { ApprovalContext, ApprovalRequestView } from "../stores/approvals";

let app: ReturnType<typeof mount> | null = null;

afterEach(() => {
  if (app) unmount(app);
  app = null;
  document.body.innerHTML = "";
});

const newerRequest: ApprovalRequestView = {
  ...approvalRequest,
  receivedSeq: 2,
  request: {
    ...approvalRequest.request,
    approvalRequestId: "apr-2",
    actionId: "act-2",
    normalizedTarget: "src/other.ts",
  },
};

type Surface = {
  push: (
    requests: readonly ApprovalRequestView[],
    context?: ApprovalContext,
  ) => void;
};

async function render(
  requests: readonly ApprovalRequestView[],
  context: ApprovalContext = approvalMatching,
  props: Record<string, unknown> = {},
): Promise<Surface> {
  if (app) {
    unmount(app);
    app = null;
    document.body.innerHTML = "";
  }
  app = mount(ApprovalSurfaceHarness, {
    target: document.body,
    props: {
      initialRequests: requests,
      initialContext: context,
      ...props,
    } as never,
  });
  flushSync();
  await tick();
  flushSync();
  return app as unknown as Surface;
}

async function push(
  surface: Surface,
  requests: readonly ApprovalRequestView[],
  context?: ApprovalContext,
): Promise<void> {
  surface.push(requests, context);
  flushSync();
  await tick();
  flushSync();
}

const byTestId = (id: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!element) throw new Error(`missing ${id}`);
  return element;
};

const maybeTestId = (id: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe("TD-30 ApprovalSurface", () => {
  it("renders nothing until the engine delivers a request", async () => {
    await render([]);

    expect(document.querySelector("dialog")).toBeNull();
    expect(maybeTestId("approval-dialog")).toBeNull();
  });

  it("shows only the newest request, not whichever came last in the array", async () => {
    await render([newerRequest, approvalRequest]);

    expect(byTestId("approval-normalized-target").textContent).toBe(
      "src/other.ts",
    );
  });

  it("keeps approval inert for a target the context does not match", async () => {
    const onRespond = vi.fn();
    await render([approvalRequest, newerRequest], approvalMatching, {
      onRespond,
    });

    expect((byTestId("approval-approve") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(byTestId("approval-inert").textContent).toContain(
      "different action",
    );
    (byTestId("approval-approve") as HTMLButtonElement).click();
    flushSync();
    expect(onRespond).not.toHaveBeenCalled();
  });

  it("submits the newest request's identity when the context matches", async () => {
    const onRespond = vi.fn();
    const matchingContext: ApprovalContext = {
      ...approvalMatching,
      actionId: "act-2",
      normalizedTarget: "src/other.ts",
    };
    await render([approvalRequest, newerRequest], matchingContext, {
      onRespond,
    });

    (byTestId("approval-approve") as HTMLButtonElement).click();
    flushSync();

    expect(onRespond).toHaveBeenCalledWith({
      approvalRequestId: "apr-2",
      runId: "run-1",
      actionId: "act-2",
      decision: "approve",
    });
  });

  it("does not fall back to an older request after dismissal", async () => {
    const onDismiss = vi.fn();
    await render([approvalRequest, newerRequest], approvalMatching, {
      onDismiss,
    });

    (byTestId("approval-dismiss") as HTMLButtonElement).click();
    flushSync();
    await tick();
    flushSync();

    expect(onDismiss).toHaveBeenCalledWith("apr-2");
    expect(maybeTestId("approval-dialog")).toBeNull();
  });

  it("re-opens on the same mounted surface for a genuinely newer request", async () => {
    const surface = await render([approvalRequest], approvalMatching);
    (byTestId("approval-dismiss") as HTMLButtonElement).click();
    flushSync();
    await tick();
    flushSync();
    expect(maybeTestId("approval-dialog")).toBeNull();

    await push(surface, [approvalRequest, newerRequest]);
    expect(byTestId("approval-normalized-target").textContent).toBe(
      "src/other.ts",
    );
  });

  it("remounts for a replacement target, so no submitted state carries over", async () => {
    const onRespond = vi.fn();
    const surface = await render([approvalRequest], approvalMatching, {
      onRespond,
    });

    (byTestId("approval-approve") as HTMLButtonElement).click();
    flushSync();
    await tick();
    flushSync();
    expect(byTestId("approval-submitted").textContent).toContain("act-1");

    await push(surface, [approvalRequest, newerRequest]);
    expect(byTestId("approval-normalized-target").textContent).toBe(
      "src/other.ts",
    );
    expect(maybeTestId("approval-submitted")).toBeNull();
    expect(onRespond).toHaveBeenCalledTimes(1);
  });
});
