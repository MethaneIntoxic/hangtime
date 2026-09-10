import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const remoteAndProductionEnvironmentKeys = [
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
  "NODE_ENV",
  "RELEASE_CHANNEL",
  "APP_REVISION",
  "RELEASE_IMAGE_DIGEST",
];

export function createHermeticEnvironment(baseEnvironment, tempRoot, port) {
  const databasePath = join(tempRoot, "uat.db");
  const clearedEnvironment = Object.fromEntries(
    remoteAndProductionEnvironmentKeys.map((key) => [key, ""]),
  );

  return {
    ...baseEnvironment,
    ...clearedEnvironment,
    CI: "true",
    DATABASE_URL: databasePath,
    TURSO_DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`,
    TURSO_AUTH_TOKEN: "",
    NODE_ENV: "development",
    HANGTIME_DEMO_MODE: "true",
    DINNER_TIME_DEMO_MODE: "false",
    AUTH_SECRET: "ci-only-hangtime-secret-000000000000000000",
    AUTH_EMAIL_DRIVER: "test",
    AUTH_TEST_EMAIL_OUTBOX_PATH: join(tempRoot, "auth-email-outbox.jsonl"),
    // Keep the seeder and Next server on the same explicit test-only key. Next
    // otherwise loads a developer .env key after the seed process has used its
    // built-in fallback, making every encrypted origin undecryptable in E2E.
    LOCATION_KEYRING_B64: "eyJhY3RpdmUiOiJ2MSIsImtleXMiOnsidjEiOiJhR0Z1WjNScGJXVXRiRzlqWVd3dGJHOWpZWFJwYjI0dGEyVjVMWFl4SVNFIn19",
    APP_URL: `http://127.0.0.1:${port}`,
    E2E_PORT: port,
    E2E_BASE_URL: `http://127.0.0.1:${port}`,
  };
}

function run(args, env, pnpmEntrypoint, localPnpmEntrypoint) {
  const entrypoint = pnpmEntrypoint || localPnpmEntrypoint;
  const command = entrypoint ? process.execPath : "pnpm";
  const commandArgs = entrypoint ? [entrypoint, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (result.error) console.error(result.error);
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  return result.status === 0;
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const tempRoot = mkdtempSync(join(tmpdir(), "dinner-time-e2e-"));
  const port = String(32000 + Math.floor(Math.random() * 1000));
  const playwrightArgs = process.argv.slice(2);
  const pnpmEntrypoint = process.env.npm_execpath;
  const localPnpmEntrypoint = process.platform === "win32"
    ? join(process.env.APPDATA || "", "npm", "node_modules", "pnpm", "bin", "pnpm.cjs")
    : null;
  const env = createHermeticEnvironment(process.env, tempRoot, port);

  try {
    if (run(["db:seed"], env, pnpmEntrypoint, localPnpmEntrypoint)) {
      run(["exec", "playwright", "test", ...playwrightArgs], env, pnpmEntrypoint, localPnpmEntrypoint);
    }
  } finally {
    const resolved = resolve(tempRoot);
    if (!resolved.startsWith(resolve(tmpdir()))) throw new Error("Refusing to remove a non-temporary E2E directory");
    rmSync(resolved, { recursive: true, force: true });
  }
}
