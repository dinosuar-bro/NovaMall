import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8080",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" }
    }
  ],
  webServer: {
    command: "pnpm start:all && docker compose logs -f frontend backend",
    url: "http://localhost:8080/api/v1/health/live",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI
  }
});
