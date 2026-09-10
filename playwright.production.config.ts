import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.PRODUCTION_E2E_PORT ?? 3211);
const BASE_URL = process.env.PRODUCTION_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const productionE2ETempRoot = mkdtempSync(path.join(tmpdir(), "hangtime-production-e2e-"));
const productionE2EDatabasePath = path.join(productionE2ETempRoot, "production-e2e.db");
const productionE2EOutboxPath = path.join(productionE2ETempRoot, "auth-email-outbox.jsonl");
const localTursoDatabaseUrl = `file:${productionE2EDatabasePath.replaceAll("\\", "/")}`;
const remoteAndProviderEnvironmentKeys = [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "TURSO_PREVIEW_DATABASE_URL",
  "TURSO_PREVIEW_AUTH_TOKEN",
  "TURSO_PRODUCTION_DATABASE_URL",
  "TURSO_PRODUCTION_AUTH_TOKEN",
  "ONEMAP_EMAIL",
  "ONEMAP_PASSWORD",
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_CALENDAR_REDIRECT_URI",
  "RESEND_API_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_OIDC_TOKEN",
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
];
const productionE2EEnvironment = {
  ...process.env,
  ...Object.fromEntries(remoteAndProviderEnvironmentKeys.map((key) => [key, ""])),
  AUTH_SECRET: "ci-only-hangtime-secret-000000000000000000",
  AUTH_EMAIL_DRIVER: "test",
  AUTH_TEST_EMAIL_OUTBOX_PATH: productionE2EOutboxPath,
  AUTH_EMAIL_FROM: "",
  LOCATION_KEYRING_B64: "eyJhY3RpdmUiOiJ2MSIsImtleXMiOnsidjEiOiJhR0Z1WjNScGJXVXRiRzlqWVd3dGJHOWpZWFJwYjI0dGEyVjVMWFl4SVNFIn19",
};
process.once("exit", () => {
  rmSync(productionE2ETempRoot, { recursive: true, force: true });
});

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
      ...productionE2EEnvironment,
      APP_URL: BASE_URL,
      NODE_ENV: "production",
      HANGTIME_DEMO_MODE: "false",
      DINNER_TIME_DEMO_MODE: "false",
      DATABASE_URL: productionE2EDatabasePath,
      TURSO_DATABASE_URL: localTursoDatabaseUrl,
      TURSO_AUTH_TOKEN: "",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
