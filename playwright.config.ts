import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { loadE2eOrchestratorConfig } from "./e2e/fixtures/test-wallet";

const orchestrator = loadE2eOrchestratorConfig();
const webUrl = new URL(orchestrator.baseUrl);
const webPort = webUrl.port || "3000";
const webHost = webUrl.hostname === "localhost" ? "localhost" : "127.0.0.1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: orchestrator.timeoutMs,
  workers: 1,
  retries: 0,
  expect: { timeout: 10_000 },
  outputDir: path.join(orchestrator.artifactDir, "test-results"),
  globalTeardown: "./e2e/fixtures/test-wallet.ts",
  reporter: [
    ["line"],
    [
      "json",
      {
        outputFile: path.join(orchestrator.artifactDir, "playwright-report.json"),
      },
    ],
  ],
  webServer: {
    command: `npm run dev -- --hostname ${webHost} --port ${webPort}`,
    url: orchestrator.baseUrl,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: orchestrator.baseUrl,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      testIgnore: /(^|\/)withdrawal(?:-failures)?\.spec\.ts$/,
      use: { ...devices["Pixel 7"] },
    },
  ],
});
