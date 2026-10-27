import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import type { SplyceEventEnvelope } from "@splyce/pi/contracts";

type Fixture = {
  caseId: string;
  eventSequence: { event: SplyceEventEnvelope }[];
};

declare global {
  interface Window {
    __td34: {
      play(events: SplyceEventEnvelope[]): void;
    };
  }
}

function readFixture(caseId: string): Fixture {
  const file = `fui-${caseId.toLowerCase()}.json`;
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "../../tests/fixtures/gui", file),
      "utf8",
    ),
  ) as Fixture;
}

/** Mounts a canonical GUI event fixture in the browser-only fixture renderer. */
export async function mountFixture(
  page: Page,
  caseId: string,
): Promise<Fixture> {
  const fixture = readFixture(caseId);
  await page.goto("/tests/gui/fixture.html");
  await page.waitForFunction(() => Boolean(window.__td34));
  await page.evaluate(
    (events) => window.__td34.play(events),
    fixture.eventSequence.map(({ event }) => event),
  );
  return fixture;
}

/** Saves an inspectable screenshot with a stable state name. */
export async function screenshot(page: Page, state: string): Promise<void> {
  await page.screenshot({
    path: `test-results/gui-${state}.png`,
    fullPage: true,
  });
}

/** Requires a visible accessible role/name pair; removing its role or label fails the spec. */
export async function requireRole(
  page: Page,
  role: Parameters<Page["getByRole"]>[0],
  name: string | RegExp,
): Promise<Locator> {
  const locator = page.getByRole(role, { name });
  await expect(locator).toBeVisible();
  return locator;
}

/** Sends a keyboard sequence through the actual focused browser control. */
export async function pressKeys(page: Page, ...keys: string[]): Promise<void> {
  for (const key of keys) await page.keyboard.press(key);
}
