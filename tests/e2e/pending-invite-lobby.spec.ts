import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(seriousOrCritical, seriousOrCritical.map((violation) => violation.id).join(", ")).toEqual([]);
}

test("shows pending seats and preserves one invite link when clipboard access fails", async ({ page }) => {
  const planId = "pending-seat-ui";
  const profile = {
    id: "user_maya",
    email: "maya@example.com",
    displayName: "Maya Chen",
    accountKind: "full",
    timezone: "Asia/Singapore",
    coarseArea: "Novena / Balestier (Central)",
    notificationPrefs: { email: true, push: false },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
  const plan = {
    id: planId,
    organizerId: profile.id,
    state: "collecting",
    version: 1,
    date: "2026-09-05",
    windowStart: "18:30",
    windowEnd: "20:30",
    mealType: "dinner",
    groupBudgetCents: 12000,
    alcoholMode: "excluded",
    fairnessMode: "equal_journeys",
    timezone: "Asia/Singapore",
    shortlistSize: 5,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    pendingInvites: [{ id: "invite_clara", displayName: "Clara Tan", status: "pending", expiresAt: "2026-08-29T00:00:00.000Z" }],
    seatSummary: { joined: 1, pending: 1, available: 1 },
  };
  const participant = {
    id: "part_maya",
    planId,
    userId: profile.id,
    role: "organizer",
    coarseOriginLabel: profile.coarseArea,
    isReady: false,
    dietaryDeclared: false,
    acknowledgedState: "pending",
    joinedAt: "2026-08-22T00:00:00.000Z",
    profile,
    dietaryRules: [],
    cuisinePreferences: [],
    availability: [],
  };
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data, requestId: "pending-seat-ui-request" }),
  });
  let reissueCount = 0;

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("clipboard denied"); } },
    });
  });
  await page.route("**/api/v1/me", (route) => route.fulfill(json({ profile })));
  await page.route(`**/api/v1/plans/${planId}`, (route) => route.fulfill(json({
    plan,
    isOrganizer: true,
    isParticipant: true,
    participants: [participant],
    currentRun: null,
    maxSelections: 1,
    ballots: [],
    userBallot: null,
    tally: null,
    activeDecision: null,
    userFeedback: null,
  })));
  await page.route(`**/api/v1/plans/${planId}/invites/invite_clara/reissue`, async (route) => {
    reissueCount += 1;
    await route.fulfill(json({ inviteUrl: "https://hangtime.test/join/invite_clara-reissued", expiresAt: "2026-09-01T00:00:00.000Z" }));
  });
  await page.route(`**/api/v1/plans/${planId}/invites/invite_clara`, async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    await route.fulfill(json({ revoked: true }));
  });

  await page.goto(`/plans/${planId}`);
  await expect(page.getByRole("heading", { name: "People & seats" })).toBeVisible();
  await expect(page.getByText("1 joined · 1 pending · 1 available")).toBeVisible();
  const pendingCard = page.getByLabel("Pending invite for Clara Tan");
  await expect(pendingCard).toBeVisible();
  await expect(pendingCard.getByRole("button", { name: "Reissue invite for Clara Tan" })).toBeVisible();
  await expect(pendingCard.getByRole("button", { name: "Revoke invite for Clara Tan" })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await expect(page.getByRole("button", { name: "Find Singapore Dining Shortlist" })).toBeDisabled();

  await page.getByRole("button", { name: "Reissue invite for Clara Tan" }).click();
  await expect(page.getByLabel("Invite link")).toHaveValue("https://hangtime.test/join/invite_clara-reissued");
  await expect(page.getByText(/same link is shown below/i)).toBeVisible();
  await page.getByRole("button", { name: "Copy link" }).click();
  expect(reissueCount).toBe(1);

  await page.getByRole("button", { name: "Revoke invite for Clara Tan" }).click();
  await expect(page.getByText("Invite revoked. No seat was added.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Pending invite for Clara Tan")).toBeHidden();
});

test("renders safe recovery for wrong-account and expired invitations", async ({ page }) => {
  await page.route("**/api/v1/invites/wrong-account-token", (route) => route.fulfill({
    status: 403,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "INVITE_EMAIL_MISMATCH", message: "private email detail must not render" } }),
  }));
  await page.route("**/api/v1/invites/expired-token", (route) => route.fulfill({
    status: 403,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "INVITE_EXPIRED", message: "private expiry detail must not render" } }),
  }));

  await page.goto("/join/wrong-account-token");
  await expect(page.getByRole("heading", { name: "This invitation is for a different account" })).toBeVisible();
  await expect(page.getByText(/private email detail/i)).toBeHidden();
  await expect(page.getByRole("button", { name: "Continue to sign in" })).toBeVisible();

  await page.goto("/join/expired-token");
  await expect(page.getByRole("heading", { name: "This invitation has expired" })).toBeVisible();
  await expect(page.getByText(/private expiry detail/i)).toBeHidden();
  await expect(page.getByRole("button", { name: "Return home" })).toBeVisible();
});

test("accepts a bound invitation without patching the signed-in profile", async ({ page }) => {
  let participationBody: Record<string, unknown> | null = null;
  let profilePatchCount = 0;
  const profile = {
    id: "user_clara",
    email: "clara@dinnertime.sg",
    displayName: "Clara Lee",
    accountKind: "full",
    timezone: "Asia/Singapore",
    coarseArea: "Jurong East / Clementi (West)",
    notificationPrefs: { email: true, push: false },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data, requestId: "bound-join-ui-request" }),
  });

  await page.route("**/api/v1/me", (route) => route.fulfill(json({ profile, demoMode: false })));
  await page.route("**/api/v1/invites/bound-seat-token", (route) => route.fulfill(json({
    plan: {
      id: "plan_bound_seat",
      mealType: "dinner",
      date: "2026-09-05",
      windowStart: "18:30",
      windowEnd: "20:30",
      organizerDisplayName: "Maya Chen",
    },
  })));
  await page.route("**/api/v1/plans/plan_bound_seat/participation", async (route) => {
    participationBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill(json({ participant: { id: "participant_clara" } }));
  });
  await page.route("**/api/v1/me/profile", async (route) => {
    if (route.request().method() === "PATCH") profilePatchCount += 1;
    await route.fulfill(json({ success: true }));
  });

  await page.goto("/join/bound-seat-token");
  await expect(page.getByRole("heading", { name: "Join the hangout" })).toBeVisible();
  const originArea = page.getByLabel("Where will you travel from?");
  await expect(originArea).toHaveValue("Jurong East / Clementi (West)");
  await page.getByRole("button", { name: /Join plan/ }).click();
  await expect(page).toHaveURL(/\/plans\/plan_bound_seat$/);
  expect(participationBody).toMatchObject({
    inviteToken: "bound-seat-token",
    coarseOriginLabel: "Jurong East / Clementi (West)",
  });
  expect(profilePatchCount).toBe(0);
});
