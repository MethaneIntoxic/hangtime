import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const workflows = resolve(process.cwd(), ".github/workflows");
const workflowFiles = readdirSync(workflows).filter((name) => /\.(?:yml|yaml)$/.test(name));
const failures = [];

for (const file of workflowFiles) {
  const path = join(workflows, file);
  const source = readFileSync(path, "utf8");
  const hasPullRequest = /^\s*pull_request\s*:/m.test(source);
  const hasSecrets = /\$\{\{\s*secrets\./.test(source);
  const hasSchedule = /^\s*schedule\s*:/m.test(source);

  if (hasPullRequest && hasSecrets) {
    failures.push(`${file}: pull_request workflow must not reference secrets`);
  }
  if (hasSchedule) {
    failures.push(`${file}: scheduled runners are disabled for zero-cost operation; use workflow_dispatch`);
  }
  for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+).*$/gm)) {
    const action = match[1];
    if (!/^[^/@]+\/[^/@]+@[a-f0-9]{40}$/.test(action)) {
      failures.push(`${file}: action is not pinned to a full commit SHA: ${action}`);
    }
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `CI_POLICY_FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`CI_POLICY_PASS workflows=${workflowFiles.length}`);
