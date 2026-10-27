import { expect, test } from "@playwright/test";
import { mountFixture, screenshot } from "./harness";

test("FUI-W4 renders its fixture transcript and attributed tool card", async ({
  page,
}) => {
  await mountFixture(page, "W4-stream-backpressure");

  await expect(page.getByTestId("turn-stream")).toHaveAttribute(
    "data-status",
    "completed",
  );
  const transcript = await page.getByTestId("turn-text").allTextContents();
  expect(transcript.join("")).not.toBe("");
  await expect(page.getByTestId("tool-card")).toHaveCount(1);
  await screenshot(page, "fui-w4-completed");
});
