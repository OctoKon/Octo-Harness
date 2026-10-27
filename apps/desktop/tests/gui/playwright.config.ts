import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  use: {
    baseURL: "http://localhost:1422",
    channel: "chromium",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 1422",
    url: "http://localhost:1422/tests/td18/fixture.html",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
