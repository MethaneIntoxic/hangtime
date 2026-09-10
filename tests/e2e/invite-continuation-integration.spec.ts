import fs from "node:fs";
import { expect, test } from "@playwright/test";

function futureDate(days = 7) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function outboxEntries(): Array<{ email: string; magicLinkUrl: string }> {
  const outboxPath = process.env.AUTH_TEST_EMAIL_OUTBOX_PATH;
  expect(outboxPath).toBeTruthy();
  if (!outboxPath || !fs.existsSync(outboxPath)) return [];
  return fs.readFileSync(outboxPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { email: string; magicLinkUrl: string });
}

function latestEmail(email: string, fromIndex: number) {
  const entries = outboxEntries().slice(fromIndex).filter((entry) => entry.email === email);
  expect(entries.length).toBeGreaterThan(0);
  return entries[entries.length - 1]!;
}

function tokenFromInviteUrl(inviteUrl: string): string {
  const token = new URL(inviteUrl).pathname.split("/").filter(Boolean).pop();
  expect(token).toBeTruthy();
  return decodeURIComponent(token as string);
}

test("completes the real opaque continuation flow across isolated contexts", async ({ browser, request }) => {
  const planResponse = await request.post("/api/v1/plans", {
    data: {
      mealType: "brunch",
      date: futureDate(),
      windowStart: "11:30",
      windowEnd: "13:30",
      groupBudgetCents: 16_000,
      alcoholMode: "excluded",
      fairnessMode: "equal_journeys",
      companionIds: ["user_ethan"],
    },
  });
  expect(planResponse.status()).toBe(201);
  const planId = (await planResponse.json()).data.planId as string;

  const plan = await request.get(`/api/v1/plans/${planId}`);
  expect(plan.status()).toBe(200);
  const pendingInvites = (await plan.json()).data.pendingInvites as Array<{ id: string; status: string }>;
  const pending = pendingInvites.find((invite) => invite.status === "pending");
  expect(pending).toBeDefined();

  const reissue = await request.post(`/api/v1/plans/${planId}/invites/${encodeURIComponent(pending!.id)}/reissue`);
  expect(reissue.status()).toBe(200);
  const inviteUrl = (await reissue.json()).data.inviteUrl as string;
  const rawInviteToken = tokenFromInviteUrl(inviteUrl);

  // This context has no session or continuation cookie. Loading the scanner
  // URL is intentionally harmless; only the later JSON POST creates state.
  const scannerContext = await browser.newContext();
  const scannerPage = await scannerContext.newPage();
  await scannerPage.goto(`/join/${encodeURIComponent(rawInviteToken)}`);
  await expect(scannerPage.getByRole("heading", { name: "Join the hangout" })).toBeVisible();
  expect((await scannerContext.cookies()).some((cookie) => cookie.name.includes("continuation"))).toBe(false);

  const continuation = await scannerContext.request.post("/api/v1/invites/continuation", {
    data: { inviteToken: rawInviteToken },
    headers: { "Content-Type": "application/json" },
  });
  expect(continuation.status()).toBe(202);
  const continuationCookie = (await scannerContext.cookies()).find((cookie) => cookie.name.includes("continuation"));
  expect(continuationCookie?.value).toBeTruthy();

  // A wrong-email request must not consume the continuation. Its outbox entry
  // is inspected only in memory and its URL is never printed.
  const wrongStart = outboxEntries().length;
  const wrongEmail = await scannerContext.request.post("/api/v1/auth/magic-link", {
    data: { email: "other@example.com", returnTo: "/join/resume" },
    headers: { "Content-Type": "application/json" },
  });
  expect(wrongEmail.status()).toBe(202);
  expect(latestEmail("other@example.com", wrongStart).magicLinkUrl).not.toContain(rawInviteToken);

  const intendedStart = outboxEntries().length;
  const intendedEmail = await scannerContext.request.post("/api/v1/auth/magic-link", {
    data: { email: "ethan@dinnertime.sg", returnTo: "/join/resume" },
    headers: { "Content-Type": "application/json" },
  });
  expect(intendedEmail.status()).toBe(202);
  const magicLinkUrl = latestEmail("ethan@dinnertime.sg", intendedStart).magicLinkUrl;
  const magicUrl = new URL(magicLinkUrl);
  expect(magicUrl.pathname).toBe("/auth/verify");
  expect(magicUrl.searchParams.get("next")).toBe("/join/resume");
  expect(magicLinkUrl).not.toContain(rawInviteToken);
  expect(magicLinkUrl).not.toContain(continuationCookie!.value);
  const magicLinkToken = new URLSearchParams(new URL(magicLinkUrl).hash.slice(1)).get("token");
  expect(magicLinkToken).toBeTruthy();

  // Simulate opening the email on another device: no continuation cookie and
  // no demo cookie. The verify page must not consume until its POST action.
  const emailContext = await browser.newContext();
  expect((await emailContext.cookies()).some((cookie) => cookie.name.includes("continuation"))).toBe(false);
  expect((await emailContext.cookies()).some((cookie) => cookie.name.includes("demo"))).toBe(false);
  const emailPage = await emailContext.newPage();
  await emailPage.goto(magicLinkUrl.toString());
  await expect(emailPage.getByRole("heading", { name: "Continue to Hangtime" })).toBeVisible();
  expect((await emailContext.cookies()).some((cookie) => cookie.name.includes("session"))).toBe(false);

  await emailPage.getByRole("button", { name: "Sign in securely" }).click();
  await expect(emailPage).toHaveURL(/\/join\/resume$/);
  const productionSession = (await emailContext.cookies()).find((cookie) => cookie.name.includes("session") && !cookie.name.includes("demo"));
  expect(productionSession?.value).toBeTruthy();

  const resume = await emailContext.request.get("/api/v1/invites/resume");
  expect(resume.status()).toBe(200);
  expect((await resume.json()).data.plan.id).toBe(planId);

  const accepted = await emailContext.request.put(`/api/v1/plans/${planId}/participation`, {
    data: { coarseOriginLabel: "Tampines / Pasir Ris (East)" },
    headers: { "Content-Type": "application/json" },
  });
  expect(accepted.status()).toBe(200);

  expect((await emailContext.request.get("/api/v1/invites/resume")).status()).toBe(403);
  const reusedInvite = await emailContext.request.get(`/api/v1/invites/${encodeURIComponent(rawInviteToken)}`);
  expect(reusedInvite.status()).toBe(403);
  expect((await reusedInvite.json()).error.code).toBe("INVITE_UNAVAILABLE");

  const replayContext = await browser.newContext();
  const replay = await replayContext.request.post("/api/v1/auth/verify", {
    data: { token: magicLinkToken },
    headers: { "Content-Type": "application/json" },
  });
  expect(replay.status()).toBe(400);
  expect((await replay.json()).error.code).toBe("LINK_ALREADY_USED");
  expect((await replayContext.cookies()).some((cookie) => cookie.name.includes("session"))).toBe(false);
  await replayContext.close();

  const finalPlan = await request.get(`/api/v1/plans/${planId}`);
  expect(finalPlan.status()).toBe(200);
  const finalData = (await finalPlan.json()).data as {
    participants: Array<{ userId: string }>;
    seatSummary: { joined: number; pending: number };
  };
  expect(finalData.participants.filter((participant) => participant.userId === "user_ethan")).toHaveLength(1);
  expect(finalData.seatSummary).toMatchObject({ joined: 2, pending: 0 });

  await emailContext.close();
  await scannerContext.close();
});
