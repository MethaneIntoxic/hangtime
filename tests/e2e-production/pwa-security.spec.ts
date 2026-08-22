import { expect, test } from "@playwright/test";

test("production headers and public-only service-worker cache", async ({ page, request, context }) => {
  const home = await request.get("/", { maxRedirects: 0 });
  expect(home.status()).toBe(307);
  expect(home.headers().location).toBe("/sign-in?next=%2F");
  expect(home.headers()["cache-control"]).toContain("no-store");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
  expect(home.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(home.headers()["strict-transport-security"]).toContain("max-age=31536000");

  const signIn = await request.get("/sign-in");
  expect(signIn.status()).toBe(200);
  expect(signIn.headers()["cache-control"]).toContain("no-store");

  const api = await request.get("/api/v1/me");
  expect(api.status()).toBe(401);
  expect(api.headers()["cache-control"]).toContain("no-store");

  const crossOriginMutation = await request.post("/api/v1/plans", {
    headers: { origin: "https://attacker.invalid" },
    data: {},
  });
  expect(crossOriginMutation.status()).toBe(403);
  expect(await crossOriginMutation.json()).toMatchObject({
    error: { code: "INVALID_ORIGIN" },
  });

  const sameOriginMutation = await request.post("/api/v1/plans", {
    headers: { origin: new URL(home.url()).origin },
    data: {},
  });
  expect(sameOriginMutation.status()).toBe(401);

  const join = await request.get("/join/canary-token?email=canary@example.com");
  expect(join.headers()["cache-control"]).toContain("no-store");
  expect(join.headers()["referrer-policy"]).toBe("no-referrer");
  expect(join.headers()["x-robots-tag"]).toContain("noindex");

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
  const worker = await request.get("/sw.js");
  expect(worker.headers()["service-worker-allowed"]).toBe("/");

  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await caches.open("dinner-time-public-shell-obsolete");
    await caches.open("hangtime-public-shell-obsolete");
    await caches.open("unrelated-application-cache");
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.unregister();
  });
  await page.reload();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await page.goto("/join/canary-token?email=canary@example.com");
  await page.goto("/?token=second-canary");

  const cacheState = await page.evaluate(async () => {
    const paths: string[] = [];
    const names = await caches.keys();
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const response of await cache.keys()) paths.push(new URL(response.url).pathname);
    }
    return { names: names.sort(), paths: paths.sort() };
  });

  expect(cacheState.paths).toEqual([
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/manifest.webmanifest",
    "/offline.html",
  ]);
  expect(cacheState.names).toContain("unrelated-application-cache");
  expect(cacheState.names).not.toContain("dinner-time-public-shell-obsolete");
  expect(cacheState.names).not.toContain("hangtime-public-shell-obsolete");
  expect(JSON.stringify(cacheState)).not.toMatch(/canary-token|second-canary|canary@example\.com/);

  await context.setOffline(true);
  await page.goto("/plans/private-plan?token=offline-canary");
  await expect(page.getByRole("heading", { name: "Hangtime is offline" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/private-plan|offline-canary|canary@example\.com|307683|1\.3204|103\.8436/);
});
