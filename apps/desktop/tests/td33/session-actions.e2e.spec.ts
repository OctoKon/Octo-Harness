import { expect, test, type Page } from "@playwright/test";

type Call = { readonly name: string; readonly args: readonly unknown[] };
type Request = {
  readonly kind: "resume" | "fork" | "rewind";
  readonly sourceSessionId: string;
  readonly entryId: string | null;
  readonly choice: "conversation" | "code" | "both" | null;
};

declare global {
  interface Window {
    __td33: {
      calls(): readonly Call[];
      requests(): readonly Request[];
      setEngine(next: "ready" | "unavailable", reason: string | null): void;
      setRewind(next: "ready" | "unavailable", reason: string | null): void;
      setCodeRestore(
        next: "ready" | "unavailable",
        reason: string | null,
      ): void;
      setSelection(next: "a" | "b" | "none"): void;
      setMode(next: "hold" | "succeed" | "fail"): void;
      release(): void;
      fail(message: string): void;
    };
  }
}

const url = "/tests/td33/session-actions.html";

const requests = (page: Page) => page.evaluate(() => window.__td33.requests());
const calls = (page: Page) => page.evaluate(() => window.__td33.calls());

const focusedTestId = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute("data-testid"));

test.describe("TD-33 D4_session_resume_fork", () => {
  test("fork names the selected ancestry, and cancelling differs from success and restores the draft", async ({
    page,
  }) => {
    await page.goto(url);
    await expect(page.getByTestId("fork-point")).toHaveText(
      "Fork point: ses_1 / anchor_1",
    );
    await expect(page.getByTestId("fork-leaves")).toHaveText("Leaves: e1, e2");

    // Keyboard: focus the control and activate it.
    await page.getByTestId("action-fork").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("action-busy")).toContainText(
      "Requesting the fork at ses_1 / anchor_1",
    );
    expect(await requests(page)).toEqual([
      {
        kind: "fork",
        sourceSessionId: "ses_1",
        entryId: "anchor_1",
        choice: null,
      },
    ]);

    // The editor is untouched by the request; a cancel restores the captured text.
    await page.getByTestId("editor").fill("edited while busy");
    await page.getByTestId("action-cancel").press("Enter");
    await expect(page.getByTestId("action-canceled")).toContainText(
      "Fork canceled",
    );
    await expect(page.getByTestId("editor")).toHaveValue("start draft");
    expect(await focusedTestId(page)).toBe("action-fork");

    // A result arriving after the cancel cannot turn it into a success.
    await page.evaluate(() => window.__td33.release());
    await expect(page.getByTestId("action-canceled")).toBeVisible();
    await expect(page.getByTestId("action-succeeded")).toHaveCount(0);
  });

  test("resume requests the session itself and settles on success with focus returned", async ({
    page,
  }) => {
    await page.goto(url);
    await page.evaluate(() => window.__td33.setMode("succeed"));
    await page.getByTestId("action-resume").click();

    expect(await requests(page)).toEqual([
      {
        kind: "resume",
        sourceSessionId: "ses_1",
        entryId: null,
        choice: null,
      },
    ]);
    await expect(page.getByTestId("action-succeeded")).toContainText(
      "Session resumed",
    );
    await expect(page.getByTestId("editor")).toHaveValue("start draft");
    expect(await focusedTestId(page)).toBe("action-resume");
  });

  test("a failed request is honest, keeps the draft and returns focus", async ({
    page,
  }) => {
    await page.goto(url);
    await page.evaluate(() => window.__td33.setMode("fail"));
    await page.getByTestId("action-fork").click();

    await expect(page.getByTestId("action-failed")).toContainText(
      "Engine refused the request",
    );
    await expect(page.getByTestId("action-failed")).toContainText(
      "draft is preserved",
    );
    await expect(page.getByTestId("editor")).toHaveValue("start draft");
    expect(
      (await calls(page)).filter((call) => call.name === "onRestoreDraft"),
    ).toEqual([{ name: "onRestoreDraft", args: ["start draft"] }]);
    expect(await focusedTestId(page)).toBe("action-fork");
  });

  test("rewind is destructive: it confirms with the safe default and Escape cancels", async ({
    page,
  }) => {
    await page.goto(url);
    await page.getByTestId("action-rewind").click();

    await expect(page.getByTestId("rewind-dialog")).toBeVisible();
    // Nothing is requested before the confirmation.
    expect(await requests(page)).toEqual([]);
    // The non-destructive control owns the default focus.
    expect(await focusedTestId(page)).toBe("rewind-cancel");

    // C3_user_rewind limits are stated before any write.
    await expect(page.getByTestId("rewind-limits")).toContainText(
      "Shell commands and external edits are not restored.",
    );
    await expect(page.getByTestId("rewind-limits")).toContainText(
      "Prior external effects are not undoable.",
    );
    await expect(page.getByTestId("rewind-limits")).toContainText(
      "never deletes it",
    );
    // Conversation-only is the safe default and needs no TD-25 receipt.
    await expect(page.getByTestId("rewind-choice-conversation")).toBeChecked();
    await expect(page.getByTestId("rewind-choice-code")).toBeDisabled();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("rewind-dialog")).toHaveCount(0);
    await expect(page.getByTestId("action-canceled")).toContainText(
      "Rewind canceled",
    );
    expect(await requests(page)).toEqual([]);
    expect(await focusedTestId(page)).toBe("action-rewind");
  });

  test("confirming a conversation rewind sends exactly the confirmed scope", async ({
    page,
  }) => {
    await page.goto(url);
    await page.evaluate(() => window.__td33.setMode("succeed"));
    await page.getByTestId("action-rewind").click();
    await page.getByTestId("rewind-confirm").click();

    expect(await requests(page)).toEqual([
      {
        kind: "rewind",
        sourceSessionId: "ses_1",
        entryId: "anchor_1",
        choice: "conversation",
      },
    ]);
    await expect(page.getByTestId("action-succeeded")).toContainText(
      "source conversation is kept as ancestry",
    );
    expect(await focusedTestId(page)).toBe("action-rewind");
  });

  test("code restore stays disabled with its reason until the receipt is admitted", async ({
    page,
  }) => {
    await page.goto(url);
    await page.getByTestId("action-rewind").click();

    await expect(page.getByTestId("rewind-choice-code")).toBeDisabled();
    await expect(page.getByTestId("rewind-choice-both")).toBeDisabled();
    await expect(page.getByTestId("rewind-choice-code-reason")).toContainText(
      "Code restore is not available yet",
    );
    await expect(page.getByTestId("rewind-code-limit")).toBeVisible();
    // The conversation choice is still confirmable.
    await expect(page.getByTestId("rewind-confirm")).toBeEnabled();

    // Once admitted, the chosen scope is what the request carries.
    await page.evaluate(() => window.__td33.setCodeRestore("ready", null));
    await page.getByTestId("rewind-choice-code").check();
    await expect(page.getByTestId("rewind-confirm")).toBeEnabled();
    await page.getByTestId("rewind-confirm").click();
    expect((await requests(page)).at(-1)).toEqual({
      kind: "rewind",
      sourceSessionId: "ses_1",
      entryId: "anchor_1",
      choice: "code",
    });
  });

  test("a rewind confirmed after the selection moved is refused, never retargeted", async ({
    page,
  }) => {
    await page.goto(url);
    await page.getByTestId("action-rewind").click();
    await page.evaluate(() => window.__td33.setSelection("b"));
    await page.getByTestId("rewind-confirm").click();

    await expect(page.getByTestId("rewind-dialog")).toBeVisible();
    await expect(page.getByTestId("rewind-blocked")).toContainText(
      "selected branch changed",
    );
    expect(await requests(page)).toEqual([]);
  });

  test("an unavailable engine disables every action with its reason, still showing the ancestry", async ({
    page,
  }) => {
    await page.goto(url);
    await page.evaluate(() =>
      window.__td33.setEngine(
        "unavailable",
        "Session revisions are not delivered to the renderer yet.",
      ),
    );

    await expect(page.getByTestId("action-fork")).toBeDisabled();
    await expect(page.getByTestId("action-resume")).toBeDisabled();
    await expect(page.getByTestId("action-rewind")).toBeDisabled();
    await expect(page.getByTestId("action-reasons")).toContainText(
      "Session revisions are not delivered to the renderer yet.",
    );
    await expect(page.getByTestId("fork-point")).toHaveText(
      "Fork point: ses_1 / anchor_1",
    );
  });

  test("the fork position follows the tree selection and states when none is selected", async ({
    page,
  }) => {
    await page.goto(url);
    await page.evaluate(() => window.__td33.setSelection("b"));
    await expect(page.getByTestId("fork-point")).toHaveText(
      "Fork point: ses_1 / anchor_2",
    );
    await expect(page.getByTestId("fork-leaves")).toHaveText("Leaves: e3");

    await page.evaluate(() => window.__td33.setSelection("none"));
    await expect(page.getByTestId("fork-point")).toHaveText(
      "No branch selected",
    );
    await expect(page.getByTestId("action-fork")).toBeDisabled();
    await expect(page.getByTestId("action-reasons")).toContainText(
      "Select a session branch first.",
    );
  });
});
