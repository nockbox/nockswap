import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { loadE2eOrchestratorConfig } from "./e2e/fixtures/test-wallet";

const orchestrator = loadE2eOrchestratorConfig();

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
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
      use: { ...devices["Pixel 7"] },
    },
  ],
});
