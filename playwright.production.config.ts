import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PRODUCTION_E2E_PORT ?? 3211);
const BASE_URL = process.env.PRODUCTION_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e-production",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "production-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node .next/standalone/server.js",
    url: BASE_URL,
    env: {
      ...process.env,
      APP_URL: BASE_URL,
      NODE_ENV: "production",
      HANGTIME_DEMO_MODE: "false",
      DINNER_TIME_DEMO_MODE: "false",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
