import { defineConfig, devices } from "@playwright/test";

const port = 8018;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "node server/index.mjs",
    env: { ...process.env, PORT: String(port) },
    url: `http://127.0.0.1:${port}/api/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
