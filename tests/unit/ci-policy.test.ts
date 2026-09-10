import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const policyScript = path.join(process.cwd(), "scripts", "check-ci-policy.mjs");
const temporaryDirectories: string[] = [];

function runPolicy(workflows: Record<string, string>) {
  const directory = mkdtempSync(path.join(tmpdir(), "hangtime-ci-policy-"));
  temporaryDirectories.push(directory);
  for (const [name, source] of Object.entries(workflows)) {
    writeFileSync(path.join(directory, name), source);
  }
  return spawnSync(process.execPath, [policyScript], {
    cwd: process.cwd(),
    env: { ...process.env, CI_WORKFLOW_DIR: directory },
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("GitHub Actions cost and trigger policy", () => {
  it("passes the checked-in workflows", () => {
    const result = spawnSync(process.execPath, [policyScript], {
      cwd: process.cwd(),
      env: { ...process.env },
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("CI_POLICY_PASS workflows=7");
  });

  it("fails closed when a hosted job lacks the explicit opt-in, timeout, or concurrency bound", () => {
    const result = runPolicy({
      "unsafe.yml": `name: Unsafe\non:\n  workflow_dispatch:\njobs:\n  build:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo unsafe\n`,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("hosted job must require vars.HOSTED_CI_ENABLED == 'true'");
    expect(result.stderr).toContain("hosted job timeout-minutes must be an integer");
    expect(result.stderr).toContain("workflow must define top-level concurrency");
  });

  it("rejects unsafe triggers, pull-request secrets, schedules, and unpinned actions", () => {
    const result = runPolicy({
      "unsafe.yml": `name: Unsafe\non:\n  pull_request:\n  pull_request_target:\n  schedule:\n    - cron: "0 0 * * *"\njobs:\n  build:\n    if: vars.HOSTED_CI_ENABLED == 'true' || true\n    runs-on: ubuntu-24.04\n    timeout-minutes: 5\n    env:\n      DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}\n    steps:\n      - uses: actions/checkout@main\n`,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pull_request workflow must not reference secrets");
    expect(result.stderr).toContain("pull_request_target is prohibited");
    expect(result.stderr).toContain("scheduled runners are disabled");
    expect(result.stderr).toContain("hosted job must require vars.HOSTED_CI_ENABLED == 'true'");
    expect(result.stderr).toContain("action is not pinned to a full commit SHA");
  });

  it("does not silently skip a runs-on entry with unsupported indentation", () => {
    const result = runPolicy({
      "unsafe.yml": `name: Unsafe\non:\n  workflow_dispatch:\njobs:\n  build:\n      runs-on: ubuntu-24.04\n      timeout-minutes: 5\n`,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("every runs-on entry must use a direct four-space job indentation");
  });
});
