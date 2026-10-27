import { expect, test } from "@playwright/test";
import { mountFixture, pressKeys, requireRole, screenshot } from "./harness";

test("FUI-W3 exposes an accessible approval dialog and keyboard response", async ({
  page,
}) => {
  await mountFixture(page, "W3-accessibility");

  const dialog = await requireRole(page, "dialog", /Approval Required/);
  await expect(dialog).toContainText("Deleting cached test artifacts.");
  await requireRole(page, "button", "Approve");
  await requireRole(page, "button", "Deny");

  await pressKeys(page, "Tab", "Enter");
  await screenshot(page, "fui-w3-approval");
});
