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
  await expect(page.getByRole("heading", { name: "This invitation isn’t available for this account" })).toBeVisible();
  await expect(page.getByText(/private email detail/i)).toBeHidden();
  await expect(page.getByRole("button", { name: "Continue securely" })).toBeVisible();

  await page.goto("/join/expired-token");
  await expect(page.getByRole("heading", { name: "This invitation has expired" })).toBeVisible();
  await expect(page.getByText(/private expiry detail/i)).toBeHidden();
  await expect(page.getByRole("button", { name: "Return home" })).toBeVisible();
});

test("does not leave a malformed invite response on an indefinite spinner", async ({ page }) => {
  await page.route("**/api/v1/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { profile: { coarseArea: "Tampines / Pasir Ris (East)" } } }),
  }));
  await page.route("**/api/v1/invites/malformed-token", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: {} }),
  }));
  await page.goto("/join/malformed-token");
  const legacyError = page.getByRole("alert").first();
  await expect(legacyError).toContainText(/couldn’t check this invitation/i);
  await expect(legacyError).toBeFocused();

  await page.route("**/api/v1/invites/resume", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: {} }),
  }));
  await page.goto("/join/resume");
  const resumeError = page.getByRole("alert").first();
  await expect(resumeError).toContainText(/couldn’t check this invitation/i);
  await expect(resumeError).toBeFocused();
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

test("scrubs an anonymous invite before token-free sign-in continuation", async ({ page }) => {
  const rawToken = "raw-anonymous-invite-token";
  let continuationBody: unknown;
  let continuationHeaders: Record<string, string> | undefined;
  let continuationCalls = 0;
  let previewCalls = 0;

  await page.route("**/api/v1/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAUTHORIZED" } }) }));
  await page.route(`**/api/v1/invites/${rawToken}`, async (route) => {
    previewCalls += 1;
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAUTHORIZED" } }) });
  });
  await page.route("**/api/v1/invites/continuation", async (route) => {
    continuationCalls += 1;
    continuationBody = route.request().postDataJSON();
    continuationHeaders = route.request().headers();
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto(`/join/${rawToken}`);
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  expect(previewCalls).toBe(0);
  expect(continuationCalls).toBe(0);
  await page.getByRole("button", { name: "Continue securely" }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=\/join\/resume$/);
  expect(page.url()).not.toContain(rawToken);
  expect(continuationBody).toEqual({ inviteToken: rawToken });
  expect(continuationHeaders?.referer).toBeUndefined();
  expect(continuationCalls).toBe(1);
});

test("shows token-free recovery after continuation fails post-scrub", async ({ page }) => {
  const rawToken = "raw-failed-continuation-token";
  await page.route("**/api/v1/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAUTHORIZED" } }) }));
  await page.route("**/api/v1/invites/continuation", (route) => route.abort("failed"));

  await page.goto(`/join/${rawToken}`);
  await page.getByRole("button", { name: "Continue securely" }).click();
  await expect(page).toHaveURL(/\/join$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Reopen your invitation" })).toBeVisible();
  expect(page.url()).not.toContain(rawToken);
});

test("recovers from sign-in request failure and keeps cross-device copy", async ({ page }) => {
  let attempts = 0;
  let lastRequestBody: Record<string, unknown> | null = null;
  await page.route("**/api/v1/auth/magic-link", async (route) => {
    attempts += 1;
    lastRequestBody = route.request().postDataJSON() as Record<string, unknown>;
    if (attempts === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ data: { accepted: true } }) });
  });

  await page.goto("/sign-in?next=/join/resume");
  await page.getByLabel("Email address").fill("clara@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/connection|try again/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText(/any device/i);
  await expect(page.getByRole("button", { name: "Change email address" })).toBeVisible();
  expect(attempts).toBe(2);
  expect(lastRequestBody).toMatchObject({ email: "clara@example.com", returnTo: "/join/resume" });
  expect(JSON.stringify(lastRequestBody)).not.toMatch(/raw|token/i);
});

test("retries verify without consuming the fragment twice and resumes safely", async ({ page }) => {
  let verifyCalls = 0;
  await page.route("**/api/v1/auth/verify", async (route) => {
    verifyCalls += 1;
    if (verifyCalls === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { authenticated: true } }) });
  });
  await page.route("**/api/v1/invites/resume", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAUTHORIZED" } }) }));
  await page.route("**/api/v1/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAUTHORIZED" } }) }));

  await page.goto("/auth/verify?next=/join/resume#token=one-time-magic-token");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByText(/connection was interrupted/i).first()).toBeVisible();
  expect(page.url()).not.toContain("one-time-magic-token");
  await page.getByRole("button", { name: "Try verification again" }).click();
  await expect(page).toHaveURL(/\/join\/resume$/);
  expect(page.url()).not.toContain("token");
  expect(verifyCalls).toBe(2);
});

test("shows safe recovery when a magic link was already used", async ({ page }) => {
  await page.route("**/api/v1/auth/verify", (route) => route.fulfill({
    status: 400,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "LINK_ALREADY_USED", message: "This sign-in link has already been used." } }),
  }));

  await page.goto("/auth/verify?next=/join/resume#token=replayed-token");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByText(/already been used/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/sign-in?next=/join/resume");
  expect(page.url()).not.toContain("replayed-token");
});

test("accepts a resumed invitation without sending a raw invite token", async ({ page }) => {
  let participationBody: Record<string, unknown> | null = null;
  const profile = { coarseArea: "Jurong East / Clementi (West)" };
  const json = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
  await page.route("**/api/v1/invites/resume", (route) => route.fulfill(json({ plan: {
    id: "plan_resumed", mealType: "dinner", date: "2026-09-05", windowStart: "18:30", windowEnd: "20:30", organizerDisplayName: "Maya Chen",
  } })));
  await page.route("**/api/v1/me", (route) => route.fulfill(json({ profile })));
  await page.route("**/api/v1/plans/plan_resumed/participation", async (route) => {
    participationBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill(json({ participant: { id: "participant_clara" } }));
  });
  await page.route("**/api/v1/plans/plan_resumed", (route) => route.fulfill(json({ plan: { id: "plan_resumed" }, participants: [] })));

  await page.goto("/join/resume");
  await expect(page.getByRole("heading", { name: "Finish joining" })).toBeVisible();
  await expect(page.getByLabel("Where will you travel from?")).toHaveValue(profile.coarseArea);
  await page.getByRole("button", { name: /Join plan/ }).click();
  await expect(page).toHaveURL(/\/plans\/plan_resumed$/);
  expect(participationBody).toEqual({ coarseOriginLabel: profile.coarseArea });
  expect(JSON.stringify(participationBody)).not.toMatch(/token|invite/i);
});

test("offers an explicit retry for a failed resumed acceptance", async ({ page }) => {
  let participationCalls = 0;
  const json = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
  await page.route("**/api/v1/invites/resume", (route) => route.fulfill(json({ plan: {
    id: "plan_retry_resume", mealType: "dinner", date: "2026-09-05", windowStart: "18:30", windowEnd: "20:30", organizerDisplayName: "Maya Chen",
  } })));
  await page.route("**/api/v1/me", (route) => route.fulfill(json({ profile: { coarseArea: "Tampines / Pasir Ris (East)" } })));
  await page.route("**/api/v1/plans/plan_retry_resume/participation", async (route) => {
    participationCalls += 1;
    if (participationCalls === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill(json({ participant: { id: "participant_retry" } }));
  });

  await page.goto("/join/resume");
  await page.getByRole("button", { name: /Join plan/ }).click();
  await expect(page.locator("#resume-join-error")).toBeFocused();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page).toHaveURL(/\/plans\/plan_retry_resume$/);
  expect(participationCalls).toBe(2);
});

test("keeps resumed invitation usable at 320px without overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile continuation layout assertion");
  await page.setViewportSize({ width: 320, height: 844 });
  const json = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
  await page.route("**/api/v1/invites/resume", (route) => route.fulfill(json({ plan: {
    id: "plan_mobile_resume", mealType: "dinner", date: "2026-09-05", windowStart: "18:30", windowEnd: "20:30", organizerDisplayName: "Maya Chen",
  } })));
  await page.route("**/api/v1/me", (route) => route.fulfill(json({ profile: { coarseArea: "Tampines / Pasir Ris (East)" } })));
  await page.goto("/join/resume");
  await expect(page.getByRole("heading", { name: "Finish joining" })).toBeVisible();
  const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.viewport);
  await expectNoSeriousA11yViolations(page);
});
