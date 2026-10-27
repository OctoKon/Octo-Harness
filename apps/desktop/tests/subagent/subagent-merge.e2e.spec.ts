import { expect, test, type Page } from "@playwright/test";

type Calls = {
  applied: string[];
  discarded: string[];
  decisions: string[];
  diffRequests: number;
};

function calls(page: Page): Promise<Calls> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __subagent: { calls(): Calls };
      }
    ).__subagent.calls(),
  );
}

async function scenario(
  page: Page,
  name: "default" | "approval" | "mismatch" | "truncated" | "error",
): Promise<void> {
  await page.evaluate(
    (next) =>
      (
        window as unknown as {
          __subagent: { scenario(value: typeof next): void };
        }
      ).__subagent.scenario(next),
    name,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/subagent/fixture.html");
  await page.waitForFunction(() => Boolean(window.__subagent));
});

test("renders changed files and the unified diff from the fixture", async ({
  page,
}) => {
  await expect(page.getByTestId("subagent-child-id")).toHaveText(
    "child-merge-1",
  );
  await expect(page.getByTestId("subagent-file")).toHaveCount(2);
  await expect(page.getByTestId("diff-view")).toBeVisible();
  await expect(page.getByTestId("subagent-apply")).toBeEnabled();
  await expect(page.getByTestId("subagent-apply-reason")).toHaveCount(0);
});

test("a requests apply once; discard needs explicit confirmation", async ({
  page,
}) => {
  await page.keyboard.press("a");
  await expect(page.getByTestId("subagent-merge-status")).toContainText(
    "Apply requested",
  );
  await page.keyboard.press("a");
  expect((await calls(page)).applied).toEqual(["worktree.apply:wt-merge-1"]);
  await expect(page.getByTestId("subagent-discard")).toBeDisabled();

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__subagent));
  await page.keyboard.press("d");
  await expect(page.getByTestId("subagent-discard-confirm")).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("data-testid"),
    ),
  ).toBe("subagent-keep");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("subagent-discard-confirm")).toHaveCount(0);
  expect((await calls(page)).discarded).toEqual([]);

  await page.keyboard.press("d");
  await page.getByTestId("subagent-discard-confirm-button").click();
  await expect(page.getByTestId("subagent-merge-status")).toContainText(
    "Discard requested",
  );
  expect((await calls(page)).discarded).toEqual(["child-merge-1"]);
});

test("matching approval focuses Deny and Y approves once", async ({ page }) => {
  await scenario(page, "approval");
  await expect(page.getByTestId("approval-card")).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("data-testid"),
    ),
  ).toBe("approval-deny-button");

  await page.keyboard.press("y");
  await expect(page.getByTestId("subagent-merge-status")).toContainText(
    "Approval submitted",
  );
  expect((await calls(page)).decisions).toEqual(["approve"]);
});

test("mismatched approval and truncated diff fail closed", async ({ page }) => {
  await scenario(page, "mismatch");
  await expect(page.getByTestId("approval-card")).toHaveCount(0);
  await expect(page.getByTestId("subagent-approval-mismatch")).toContainText(
    "digest does not match",
  );
  await expect(page.getByTestId("subagent-apply")).toBeDisabled();
  await page.keyboard.press("y");
  expect((await calls(page)).decisions).toEqual([]);

  await scenario(page, "truncated");
  await expect(page.getByTestId("subagent-truncated")).toContainText(
    "truncated",
  );
  await expect(page.getByTestId("subagent-apply")).toBeDisabled();

  await scenario(page, "error");
  await expect(page.getByTestId("subagent-error")).toContainText(
    "workspace operation failed",
  );
  await expect(page.getByTestId("subagent-error")).not.toContainText(
    "IO_ERROR",
  );
});
