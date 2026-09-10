import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const workflows = resolve(process.cwd(), process.env.CI_WORKFLOW_DIR ?? ".github/workflows");
const workflowFiles = readdirSync(workflows).filter((name) => /\.(?:yml|yaml)$/.test(name));
const failures = [];
const maxTimeoutMinutes = 30;

function workflowJobs(source) {
  const lines = source.split(/\r?\n/);
  const jobsStart = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsStart === -1) return [];

  const jobs = [];
  let current;
  for (const line of lines.slice(jobsStart + 1)) {
    const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobMatch) {
      if (current) jobs.push(current);
      current = { id: jobMatch[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) jobs.push(current);
  return jobs;
}

function jobIfCondition(lines) {
  const ifIndex = lines.findIndex((line) => /^ {4}if:\s*/.test(line));
  if (ifIndex === -1) return "";

  const condition = [lines[ifIndex]];
  for (const line of lines.slice(ifIndex + 1)) {
    if (/^ {4}\S/.test(line)) break;
    condition.push(line);
  }
  return condition.join("\n");
}

function hasFailClosedHostedOptIn(condition) {
  const expression = condition
    .replace(/^\s*if:\s*/, "")
    .replace(/^\s*[>|]-?\s*/, "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (expression.includes("||") || expression.includes("!=") || /(^|\s)!/.test(expression)) {
    return false;
  }
  return /^(?:\$\{\{\s*)?vars\.HOSTED_CI_ENABLED\s*==\s*['"]true['"](?=\s*(?:&&|\}\}|$))/.test(expression);
}

for (const file of workflowFiles) {
  const path = join(workflows, file);
  const source = readFileSync(path, "utf8");
  const hasPullRequest = /^ {2}pull_request\s*:/m.test(source);
  const hasPullRequestTarget = /^ {2}pull_request_target\s*:/m.test(source);
  const hasSecrets = /\$\{\{\s*secrets\./.test(source);
  const hasSchedule = /^ {2}schedule\s*:/m.test(source);
  const hasWorkflowRun = /^ {2}workflow_run\s*:/m.test(source);

  if (hasPullRequest && hasSecrets) {
    failures.push(`${file}: pull_request workflow must not reference secrets`);
  }
  if (hasPullRequestTarget) {
    failures.push(`${file}: pull_request_target is prohibited; use secret-free pull_request validation`);
  }
  if (hasSchedule) {
    failures.push(`${file}: scheduled runners are disabled for zero-cost operation; use workflow_dispatch`);
  }
  if (hasWorkflowRun && hasSecrets && !/github\.event\.workflow_run\.head_repository\.full_name\s*==\s*github\.repository/.test(source)) {
    failures.push(`${file}: workflow_run jobs using secrets must require a same-repository source`);
  }
  if (!/^concurrency:\s*$/m.test(source)) {
    failures.push(`${file}: workflow must define top-level concurrency to bound duplicate runs`);
  }

  const jobs = workflowJobs(source);
  if (jobs.length === 0) {
    failures.push(`${file}: workflow must declare jobs`);
  }
  const runsOnLines = source.split(/\r?\n/).filter((line) => /^\s+runs-on:\s*/.test(line));
  const recognizedRunsOnLines = jobs.flatMap((job) => job.lines.filter((line) => /^ {4}runs-on:\s*/.test(line)));
  if (runsOnLines.length !== recognizedRunsOnLines.length) {
    failures.push(`${file}: every runs-on entry must use a direct four-space job indentation that the policy can inspect`);
  }
  for (const job of jobs) {
    const runsOn = job.lines.some((line) => /^ {4}runs-on:\s*/.test(line));
    if (!runsOn) continue;

    if (!hasFailClosedHostedOptIn(jobIfCondition(job.lines))) {
      failures.push(`${file}:${job.id}: hosted job must require vars.HOSTED_CI_ENABLED == 'true'`);
    }

    const timeoutMatch = job.lines.find((line) => /^ {4}timeout-minutes:\s*/.test(line))?.match(/^ {4}timeout-minutes:\s*(\d+)\s*(?:#.*)?$/);
    const timeoutMinutes = timeoutMatch ? Number(timeoutMatch[1]) : NaN;
    if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > maxTimeoutMinutes) {
      failures.push(`${file}:${job.id}: hosted job timeout-minutes must be an integer from 1 to ${maxTimeoutMinutes}`);
    }
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
