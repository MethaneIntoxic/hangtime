import { spawnSync } from "node:child_process";

const pnpmEntrypoint = process.env.npm_execpath;
const profiles = {
  fast: [
    ["lint"],
    ["typecheck"],
    ["test"],
    ["check:pwa"],
    ["check:maps"],
    ["build"],
  ],
  browser: [["test:e2e:ci"]],
  production: [["test:e2e:production"]],
  security: [["audit", "--prod", "--audit-level", "high"]],
  all: [
    ["lint"],
    ["typecheck"],
    ["test"],
    ["check:pwa"],
    ["check:maps"],
    ["build"],
    ["test:e2e:ci"],
    ["test:e2e:production"],
  ],
};

const profileArgument = process.argv.find((argument) => argument.startsWith("--profile="));
const profile = profileArgument?.slice("--profile=".length) ?? process.env.CI_PROFILE ?? "all";
const commands = profiles[profile];
if (!commands) {
  console.error(`Unknown CI_PROFILE=${profile}. Choose one of: ${Object.keys(profiles).join(", ")}.`);
  process.exit(2);
}

if (process.env.CI_VALIDATE_WORKFLOWS === "true" || process.argv.includes("--validate-workflows")) {
  commands.unshift(["check:ci"]);
}

/*
 * The default profile stays compatible with the original local command while
 * GitHub and operators can select bounded, reusable checks. Production E2E is
 * deliberately opt-in because it starts a local server and is not a fast PR gate.
 */

for (const args of commands) {
  console.log(`\n> pnpm ${args.join(" ")}`);
  const command = pnpmEntrypoint ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const commandArgs = pnpmEntrypoint ? [pnpmEntrypoint, ...args] : args;
  const result = spawnSync(command, commandArgs, { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.error) console.error(result.error);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("LOCAL_CI_PASS");
