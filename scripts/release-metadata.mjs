import { appendFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const sourceSha = (process.env.SOURCE_SHA ?? process.env.RELEASE_SHA ?? process.argv[2] ?? "").trim();
const channel = (process.env.RELEASE_CHANNEL ?? process.argv[3] ?? "").trim();
const deploymentUrl = (process.env.DEPLOYMENT_URL ?? process.argv[4] ?? "").trim().replace(/\/$/, "");

if (!/^[a-f0-9]{40}$/.test(sourceSha)) {
  throw new Error("SOURCE_SHA must be a full lowercase 40-character commit SHA.");
}

try {
  execFileSync("git", ["cat-file", "-e", `${sourceSha}^{commit}`], { stdio: "ignore" });
} catch {
  throw new Error(`SOURCE_SHA is not available as a commit in this checkout: ${sourceSha}`);
}

if (channel && !["preview", "production"].includes(channel)) {
  throw new Error("RELEASE_CHANNEL must be preview or production when supplied.");
}

if (deploymentUrl && !/^https:\/\/[A-Za-z0-9.-]+\.vercel\.app$/.test(deploymentUrl)) {
  throw new Error("DEPLOYMENT_URL must be an HTTPS Vercel deployment URL when supplied.");
}

const metadata = {
  sourceSha,
  ...(channel ? { channel } : {}),
  ...(deploymentUrl ? { deploymentUrl } : {}),
};
const lines = [
  `RELEASE_METADATA source_sha=${sourceSha}`,
  ...(channel ? [`RELEASE_METADATA channel=${channel}`] : []),
  ...(deploymentUrl ? [`RELEASE_METADATA deployment_url=${deploymentUrl}`] : []),
];
console.log(JSON.stringify(metadata, null, 2));
for (const line of lines) console.log(line);

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath && existsSync(summaryPath)) {
  appendFileSync(summaryPath, `\n### Release metadata\n${lines.map((line) => `- ${line}`).join("\n")}\n`);
}
