import { spawnSync } from "node:child_process";

const pnpmEntrypoint = process.env.npm_execpath;
const commands = [
  ["lint"],
  ["typecheck"],
  ["test"],
  ["check:pwa"],
  ["check:maps"],
  ["build"],
  ["test:e2e:ci"],
  ["test:e2e:production"],
];

for (const args of commands) {
  console.log(`\n> pnpm ${args.join(" ")}`);
  const command = pnpmEntrypoint ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const commandArgs = pnpmEntrypoint ? [pnpmEntrypoint, ...args] : args;
  const result = spawnSync(command, commandArgs, { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.error) console.error(result.error);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("LOCAL_CI_PASS");
