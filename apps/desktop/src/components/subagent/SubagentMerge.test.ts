import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import SubagentMerge from "./SubagentMerge.svelte";
import type {
  SubagentApprovalRequest,
  SubagentChild,
  SubagentDiff,
} from "./merge";
import fixture from "../../../tests/subagent/merge-fixture.json";

const { child, diff, approval } = fixture as unknown as {
  child: SubagentChild;
  diff: SubagentDiff;
  approval: SubagentApprovalRequest;
};

let app: ReturnType<typeof mount> | null = null;

afterEach(() => {
  if (app) unmount(app);
  app = null;
  document.body.innerHTML = "";
});

async function render(props: Record<string, unknown>): Promise<void> {
  if (app) {
    unmount(app);
    app = null;
  }
  document.body.innerHTML = "";
  app = mount(SubagentMerge, {
    target: document.body,
    props: {
      child,
      onRequestDiff: vi.fn(),
      onApply: vi.fn(),
      onDiscard: vi.fn(),
      onApproval: vi.fn(),
      ...props,
    } as never,
  });
  flushSync();
  await tick();
  flushSync();
}

function press(key: string): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

const byTestId = (id: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!element) throw new Error(`missing ${id}`);
  return element;
};

const maybeTestId = (id: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

const text = (): string => document.body.textContent ?? "";

describe("SubagentMerge", () => {
  it("renders the child, file list, and unified diff from the fixture", async () => {
    await render({ child, diff });

    expect(byTestId("subagent-child-id").textContent?.trim()).toBe(
      child.childId,
    );
    expect(byTestId("subagent-team").textContent?.trim()).toBe(child.team);
    expect(byTestId("subagent-role").textContent?.trim()).toBe(child.role);
    expect(byTestId("subagent-child-status").textContent?.trim()).toBe(
      child.status,
    );
    expect(byTestId("subagent-summary").textContent?.trim()).toBe(
      child.summary,
    );
    expect(text()).toContain("apps/desktop/src/lib/retry.ts:1");
    expect(text()).toContain(
      "apps/desktop/src/components/merge/MergePanel.svelte:2",
    );

    const files = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="subagent-file"]',
      ),
    ];
    expect(files).toHaveLength(2);
    expect(files[0]?.textContent).toContain("apps/desktop/src/lib/retry.ts");
    expect(files[0]?.textContent).toContain("Added");
    expect(files[1]?.textContent).toContain(
      "apps/desktop/src/components/merge/MergePanel.svelte",
    );
    expect(files[1]?.textContent).toContain("Modified");

    expect(byTestId("diff-view")).not.toBeNull();
    expect(text()).toContain("export function retry(): void {}");

    const diffFileButtons = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Files"] button',
      ),
    ];
    expect(diffFileButtons).toHaveLength(2);
    diffFileButtons[1]?.click();
    flushSync();
    expect(text()).toContain("export const retries = 3;");
  });

  it("requests apply once on `a` and stays waiting without an approval", async () => {
    const onApply = vi.fn();
    await render({ child, diff, onApply });

    press("a");
    flushSync();
    press("a");
    flushSync();

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(diff);
    expect(byTestId("subagent-merge-status").textContent).toContain(
      "Apply requested",
    );
    expect(maybeTestId("approval-card")).toBeNull();
    expect((byTestId("subagent-apply") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((byTestId("subagent-discard") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("renders a matching approval focused on Deny, and Y approves once", async () => {
    const onApproval = vi.fn();
    await render({ child, diff, approval, onApproval });

    expect(maybeTestId("approval-card")).not.toBeNull();
    expect(byTestId("subagent-approval-args").textContent).toContain("2 files");
    expect(byTestId("subagent-approval-args").textContent).toContain(
      diff.argumentsDigest,
    );
    expect(document.activeElement).toBe(byTestId("approval-deny-button"));
    expect((byTestId("subagent-discard") as HTMLButtonElement).disabled).toBe(
      true,
    );

    press("y");
    flushSync();
    await tick();
    flushSync();

    expect(onApproval).toHaveBeenCalledTimes(1);
    expect(onApproval).toHaveBeenCalledWith("approve");
    expect(byTestId("subagent-merge-status").textContent).toContain(
      "Approval submitted",
    );
    expect(text()).not.toContain("worktree changes were applied");
  });

  it("blocks a mismatched approval digest and explains why", async () => {
    const onApproval = vi.fn();
    await render({
      child,
      diff,
      approval: { ...approval, argumentsDigest: "sha256:not-the-same" },
      onApproval,
    });

    expect(maybeTestId("approval-card")).toBeNull();
    expect(byTestId("subagent-approval-mismatch").textContent).toContain(
      "digest does not match",
    );
    expect(byTestId("subagent-apply-reason").textContent).toContain(
      "digest does not match",
    );
    expect((byTestId("subagent-apply") as HTMLButtonElement).disabled).toBe(
      true,
    );

    press("y");
    flushSync();
    expect(onApproval).not.toHaveBeenCalled();
  });

  it("blocks Apply for a truncated diff and states the reason", async () => {
    const onApply = vi.fn();
    await render({
      child,
      diff: { ...diff, truncated: true },
      approval,
      onApply,
    });

    expect(byTestId("subagent-truncated").textContent).toContain("truncated");
    expect(byTestId("subagent-apply-reason").textContent).toContain(
      "truncated",
    );
    expect((byTestId("subagent-apply") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(maybeTestId("approval-card")).toBeNull();

    press("a");
    flushSync();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("redacts the summary and never renders raw loader errors", async () => {
    await render({
      child: {
        ...child,
        summary:
          "Retries with token=super-secret-value and sk-abcdefgh12345678",
      },
      diff: null,
      error: "IO_ERROR: C:\\private\\worktree",
    });

    expect(byTestId("subagent-summary").textContent).not.toContain(
      "super-secret-value",
    );
    expect(text()).not.toContain("sk-abcdefgh12345678");
    expect(byTestId("subagent-error").textContent).toContain(
      "workspace operation failed",
    );
    expect(text()).not.toContain("C:\\private\\worktree");
    expect(text()).not.toContain("IO_ERROR");
  });

  it("opens discard with Keep focused, and only explicit confirmation discards", async () => {
    const onDiscard = vi.fn();
    await render({ child, diff, onDiscard });

    press("d");
    flushSync();
    await tick();
    flushSync();

    expect(byTestId("subagent-discard-confirm")).not.toBeNull();
    expect(document.activeElement).toBe(byTestId("subagent-keep"));

    byTestId("subagent-keep").click();
    flushSync();
    await tick();
    flushSync();

    expect(maybeTestId("subagent-discard-confirm")).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();

    press("d");
    flushSync();
    await tick();
    flushSync();
    press("Escape");
    flushSync();
    await tick();
    flushSync();

    expect(maybeTestId("subagent-discard-confirm")).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();

    press("d");
    flushSync();
    await tick();
    flushSync();
    byTestId("subagent-discard-confirm-button").click();
    flushSync();

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledWith(child.childId);
    expect(maybeTestId("subagent-discard-confirm")).toBeNull();
  });
});
