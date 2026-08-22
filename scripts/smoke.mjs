const baseUrl = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const expectedRevision = process.argv[3] ?? process.env.SMOKE_EXPECTED_REVISION;
const expectedImageDigest = process.argv[4] ?? process.env.SMOKE_EXPECTED_IMAGE_DIGEST;

async function check(path, expectations) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  if (expectations.status && response.status !== expectations.status) {
    throw new Error(`${path}: expected ${expectations.status}, received ${response.status}`);
  }
  for (const [name, pattern] of Object.entries(expectations.headers ?? {})) {
    const value = response.headers.get(name) ?? "";
    if (!pattern.test(value)) throw new Error(`${path}: ${name}=${JSON.stringify(value)} did not match ${pattern}`);
  }
  return response;
}

const health = await check("/api/health", {
  status: 200,
  headers: { "cache-control": /no-store/i, "x-content-type-options": /nosniff/i },
});
const payload = await health.json();
if (payload.status !== "ok") throw new Error("health payload is not ok");
if (expectedRevision && payload.revision !== expectedRevision) {
  throw new Error(`revision mismatch: expected ${expectedRevision}, received ${payload.revision}`);
}
if (expectedImageDigest && payload.imageDigest !== expectedImageDigest) {
  throw new Error(`image digest mismatch: expected ${expectedImageDigest}, received ${payload.imageDigest}`);
}

await check("/", {
  status: 307,
  headers: {
    "cache-control": /no-store/i,
    location: /^\/sign-in\?next=%2F$/,
    "x-frame-options": /DENY/i,
    "content-security-policy": /frame-ancestors 'none'/i,
  },
});

await check("/sign-in", {
  status: 200,
  headers: {
    "cache-control": /no-store/i,
    "x-frame-options": /DENY/i,
    "content-security-policy": /frame-ancestors 'none'/i,
  },
});

await check("/api/v1/me", { status: 401, headers: { "cache-control": /no-store/i } });
await check("/manifest.webmanifest", { status: 200, headers: { "content-type": /application\/manifest\+json/i } });
await check("/sw.js", { status: 200, headers: { "service-worker-allowed": /^\/$/ } });

const demoSwitch = await fetch(`${baseUrl}/api/v1/me/switch`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: new URL(baseUrl).origin },
  body: JSON.stringify({ userId: "user_maya" }),
});
if (demoSwitch.status !== 404) throw new Error(`production demo switch returned ${demoSwitch.status}, expected 404`);

console.log(`SMOKE_CHECK_PASS ${baseUrl} revision=${payload.revision} image=${payload.imageDigest}`);
