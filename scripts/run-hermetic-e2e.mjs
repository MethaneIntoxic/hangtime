import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const tempRoot = mkdtempSync(join(tmpdir(), "dinner-time-e2e-"));
const databaseUrl = join(tempRoot, "uat.db");
const port = String(32000 + Math.floor(Math.random() * 1000));
const pnpmEntrypoint = process.env.npm_execpath;
const env = {
  ...process.env,
  CI: "true",
  DATABASE_URL: databaseUrl,
  HANGTIME_DEMO_MODE: "true",
  AUTH_SECRET: "ci-only-hangtime-secret-000000000000000000",
  // Keep the seeder and Next server on the same explicit test-only key. Next
  // otherwise loads a developer .env key after the seed process has used its
  // built-in fallback, making every encrypted origin undecryptable in E2E.
  LOCATION_KEYRING_B64: "eyJhY3RpdmUiOiJ2MSIsImtleXMiOnsidjEiOiJhR0Z1WjNScGJXVXRiRzlqWVd3dGJHOWpZWFJwYjI0dGEyVjVMWFl4SVNFIn19",
  APP_URL: `http://127.0.0.1:${port}`,
  E2E_PORT: port,
  E2E_BASE_URL: `http://127.0.0.1:${port}`,
};

function run(args) {
  const command = pnpmEntrypoint ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const commandArgs = pnpmEntrypoint ? [pnpmEntrypoint, ...args] : args;
  const result = spawnSync(command, commandArgs, { cwd: process.cwd(), env, stdio: "inherit" });
  if (result.error) console.error(result.error);
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  return result.status === 0;
}

try {
  if (run(["db:seed"])) run(["exec", "playwright", "test"]);
} finally {
  const resolved = resolve(tempRoot);
  if (!resolved.startsWith(resolve(tmpdir()))) throw new Error("Refusing to remove a non-temporary E2E directory");
  rmSync(resolved, { recursive: true, force: true });
}
