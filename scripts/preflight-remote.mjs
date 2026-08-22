import { execFileSync } from "node:child_process";

function run(command, args = []) {
  try {
    return { ok: true, output: execFileSync(command, args, {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    }).trim() };
  } catch (error) {
    const output = [error?.stdout, error?.stderr].filter((value) => typeof value === "string").join("\n").trim();
    return { ok: false, output: output || error?.message || "command failed" };
  }
}

const checks = [];
function record(id, ok, detail, fix) { checks.push({ id, ok, detail, fix: ok ? undefined : fix }); }

const head = run("git", ["rev-parse", "HEAD"]);
record("git.commit", head.ok && /^[a-f0-9]{40}$/.test(head.output), head.ok ? head.output : "No initial commit", "Create the reviewed initial commit.");
const status = run("git", ["status", "--porcelain"]);
record("git.clean", status.ok && status.output === "", status.ok && !status.output ? "Clean worktree" : "Uncommitted files remain", "Review and commit the intended deployment source.");
const remote = run("git", ["remote", "get-url", "origin"]);
record("git.origin", remote.ok && /^https:\/\/github\.com\//i.test(remote.output), remote.ok ? remote.output : "No GitHub origin", "Create a personal GitHub repository and configure origin.");

const ghAuth = run("gh", ["auth", "status", "--hostname", "github.com"]);
record("github.auth", ghAuth.ok, ghAuth.ok ? "GitHub CLI authenticated" : "GitHub CLI not authenticated", "Run gh auth login.");
const ghHeaders = run("gh", ["api", "-i", "user"]);
const scopes = ghHeaders.output.match(/^x-oauth-scopes:\s*(.+)$/im)?.[1]?.split(",").map((value) => value.trim()) ?? [];
record("github.workflow_scope", ghHeaders.ok && scopes.includes("workflow"), scopes.length ? `Scopes: ${scopes.join(", ")}` : "OAuth scopes unavailable", "Run gh auth refresh -h github.com -s workflow.");

const vercel = run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["dlx", "vercel@59.1.4", "whoami"]);
record("vercel.auth", vercel.ok, vercel.ok ? vercel.output : "Vercel CLI is not authenticated", "Run pnpm dlx vercel@59.1.4 login.");
const turso = run(process.platform === "win32" ? "turso.exe" : "turso", ["auth", "status"]);
record("turso.auth", turso.ok, turso.ok ? turso.output : "Turso CLI is unavailable or not authenticated", "Install Turso CLI and run turso auth login.");

for (const variable of ["VERCEL_ORG_ID", "VERCEL_PROJECT_ID", "TURSO_PREVIEW_DATABASE_URL", "TURSO_PRODUCTION_DATABASE_URL"]) {
  const value = process.env[variable]?.trim();
  record(`config.${variable.toLowerCase()}`, Boolean(value), value ? "Supplied" : "Not supplied", `Set ${variable} for operator preflight inspection.`);
}

for (const check of checks) {
  console.log(`${(check.ok ? "PASS" : "BLOCKED").padEnd(7)} ${check.id}: ${check.detail}`);
  if (check.fix) console.log(`        next: ${check.fix}`);
}
const blocked = checks.filter((check) => !check.ok);
if (blocked.length) {
  console.error(`REMOTE_PREFLIGHT_BLOCKED count=${blocked.length}`);
  process.exit(1);
}
console.log("REMOTE_PREFLIGHT_PASS");
