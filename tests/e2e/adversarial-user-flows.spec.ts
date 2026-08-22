import { expect, test, type APIRequestContext } from "@playwright/test";

async function switchUser(request: APIRequestContext, userId: string) {
  const response = await request.post("/api/v1/me/switch", { data: { userId } });
  expect(response.status()).toBe(200);
}

async function currentCompanionDisplayName(request: APIRequestContext, companionId: string): Promise<string> {
  const response = await request.get("/api/v1/companions");
  expect(response.status()).toBe(200);
  const companions = (await response.json()).data.companions as Array<{
    companionId: string;
    displayName: string;
  }>;
  const companion = companions.find((candidate) => candidate.companionId === companionId);
  expect(companion, `missing current companion record for ${companionId}`).toBeDefined();
  return companion!.displayName;
}

function futureDate(days = 7) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function createCouplePlan(request: APIRequestContext) {
  const response = await request.post("/api/v1/plans", {
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
  expect(response.status()).toBe(201);
  return (await response.json()).data.planId as string;
}

function tokenFromInviteUrl(inviteUrl: string) {
  const token = new URL(inviteUrl).pathname.split("/").filter(Boolean).pop();
  expect(token).toBeTruthy();
  return decodeURIComponent(token as string);
}

test.describe("Adversarial user and recovery journeys", () => {
  test("validates plan payloads and preserves form state after a retryable failure", async ({ page, context }) => {
    const missingCompanion = await context.request.post("/api/v1/plans", {
      data: { date: futureDate(), companionIds: [] },
    });
    expect(missingCompanion.status()).toBe(400);

    const duplicateCompanion = await context.request.post("/api/v1/plans", {
      data: { date: futureDate(), companionIds: ["user_ethan", "user_ethan"] },
    });
    expect(duplicateCompanion.status()).toBe(400);

    const invalidWindow = await context.request.post("/api/v1/plans", {
      data: {
        date: futureDate(),
        windowStart: "21:30",
        windowEnd: "19:00",
        companionIds: ["user_ethan"],
      },
    });
    expect(invalidWindow.status()).toBe(400);

    let createAttempts = 0;
    await page.route("**/api/v1/plans", async (route) => {
      if (route.request().method() === "POST" && createAttempts++ === 0) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "Kitchen is temporarily unavailable." } }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/plans/new");
    const ethan = page.getByRole("button", { name: /Ethan Tan/ });
    await ethan.click();
    await expect(ethan).toHaveAttribute("aria-pressed", "true");
    const brunch = page.getByRole("radio", { name: /Brunch/ });
    await brunch.focus();
    await page.keyboard.press("Space");
    await expect(brunch).toBeChecked();
    await page.locator('input[type="range"]').fill("180");
    await page.getByRole("button", { name: "Create Plan & Go to Lobby" }).click();

    await expect(page.getByText("Kitchen is temporarily unavailable.")).toBeVisible();
    await expect(page).toHaveURL(/\/plans\/new/);
    await expect(ethan).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('input[type="range"]')).toHaveValue("180");
    await expect(brunch).toBeChecked();

    await page.getByRole("button", { name: "Create Plan & Go to Lobby" }).click();
    await expect(page).toHaveURL(/\/plans\/plan_/);
    await expect(page.getByText("S$180 Total")).toBeVisible();
  });

  test("accepts an email-bound third-diner invitation once through the UI", async ({ page, context }) => {
    const planId = await createCouplePlan(context.request);
    const createdPlanResponse = await context.request.get(`/api/v1/plans/${planId}`);
    expect(createdPlanResponse.status()).toBe(200);
    const createdPlan = (await createdPlanResponse.json()).data as {
      participants: Array<{ userId: string }>;
      pendingInvites: Array<{ displayName: string; status: string }>;
    };
    const ethanDisplayName = await currentCompanionDisplayName(context.request, "user_ethan");
    expect(createdPlan.participants).toHaveLength(1);
    expect(createdPlan.participants[0]?.userId).toBe("user_maya");
    expect(createdPlan.pendingInvites).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayName: ethanDisplayName, status: "pending" }),
    ]));

    const inviteResponse = await context.request.post(`/api/v1/plans/${planId}/invites`, {
      data: { email: "clara@dinnertime.sg" },
    });
    expect(inviteResponse.status()).toBe(201);
    const inviteData = (await inviteResponse.json()).data as { inviteId: string; token?: string };
    expect(inviteData).not.toHaveProperty("token");

    const planWithClaraInviteResponse = await context.request.get(`/api/v1/plans/${planId}`);
    expect(planWithClaraInviteResponse.status()).toBe(200);
    const planWithClaraInvite = (await planWithClaraInviteResponse.json()).data as {
      pendingInvites: Array<{ id: string; displayName: string; status: string }>;
    };
    const claraDisplayName = await currentCompanionDisplayName(context.request, "user_clara");
    const claraInvite = planWithClaraInvite.pendingInvites.find(
      (pendingInvite) => pendingInvite.displayName === claraDisplayName && pendingInvite.status === "pending",
    );
    expect(claraInvite).toBeDefined();

    const reissueResponse = await context.request.post(
      `/api/v1/plans/${planId}/invites/${encodeURIComponent(claraInvite!.id)}/reissue`,
    );
    expect(reissueResponse.status()).toBe(200);
    const reissuedInvite = (await reissueResponse.json()).data as { inviteUrl: string; token?: string };
    expect(reissuedInvite).not.toHaveProperty("token");
    const inviteToken = tokenFromInviteUrl(reissuedInvite.inviteUrl);

    await switchUser(context.request, "user_clara");
    const profileBeforeJoinResponse = await context.request.get("/api/v1/me");
    expect(profileBeforeJoinResponse.status()).toBe(200);
    const profileBeforeJoin = (await profileBeforeJoinResponse.json()).data.profile as {
      displayName: string;
      coarseArea: string;
    };
    await page.goto(`/join/${inviteToken}`);
    await expect(page.getByRole("heading", { name: "Join the hangout" })).toBeVisible();
    await page.getByLabel("Where will you travel from?").selectOption({ label: "Tampines / Pasir Ris (East)" });
    await page.getByRole("button", { name: /Join plan/ }).click();

    await expect(page).toHaveURL(new RegExp(`/plans/${planId}$`));
    await expect(page.getByText("Lobby & Readiness")).toBeVisible();

    const profileAfterJoinResponse = await context.request.get("/api/v1/me");
    expect(profileAfterJoinResponse.status()).toBe(200);
    const profileAfterJoin = (await profileAfterJoinResponse.json()).data.profile as {
      displayName: string;
      coarseArea: string;
    };
    expect(profileAfterJoin.displayName).toBe(profileBeforeJoin.displayName);
    expect(profileAfterJoin.coarseArea).toBe(profileBeforeJoin.coarseArea);

    const reusedInvite = await context.request.get(`/api/v1/invites/${inviteToken}`);
    expect(reusedInvite.status()).toBe(403);
    expect((await reusedInvite.json()).error.code).toBe("INVITE_UNAVAILABLE");
  });

  test("enforces the ballot contract and prevents outsider operations", async ({ context }) => {
    const planResponse = await context.request.get("/api/v1/plans/plan_friday_dinner");
    expect(planResponse.status()).toBe(200);
    const planPayload = (await planResponse.json()).data;
    const candidateIds = planPayload.currentRun.candidates.map((candidate: { id: string }) => candidate.id);

    const empty = await context.request.put("/api/v1/plans/plan_friday_dinner/ballot", {
      data: { candidateIds: [] },
    });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).error.code).toBe("INVALID_SELECTION");

    const duplicate = await context.request.put("/api/v1/plans/plan_friday_dinner/ballot", {
      data: { candidateIds: [candidateIds[0], candidateIds[0]] },
    });
    expect(duplicate.status()).toBe(400);
    expect((await duplicate.json()).error.code).toBe("DUPLICATE_SELECTION");

    const overLimit = await context.request.put("/api/v1/plans/plan_friday_dinner/ballot", {
      data: { candidateIds: candidateIds.slice(0, planPayload.maxSelections + 1) },
    });
    expect(overLimit.status()).toBe(400);
    expect((await overLimit.json()).error.code).toBe("MAX_SELECTIONS_EXCEEDED");

    for (const participant of planPayload.participants) {
      expect(participant).not.toHaveProperty("postalCode");
      expect(participant).not.toHaveProperty("lat");
      expect(participant).not.toHaveProperty("lng");
      expect(participant.profile).not.toHaveProperty("postalCode");
      expect(participant.profile).not.toHaveProperty("lat");
      expect(participant.profile).not.toHaveProperty("lng");
    }

    await switchUser(context.request, "user_clara");
    const deniedCalls = [
      context.request.get("/api/v1/plans/plan_friday_dinner"),
      context.request.post("/api/v1/plans/plan_friday_dinner/invites", { data: {} }),
      context.request.put("/api/v1/plans/plan_friday_dinner/ballot", { data: { candidateIds: [candidateIds[0]] } }),
      context.request.post("/api/v1/plans/plan_friday_dinner/confirm", {
        data: { candidateId: candidateIds[0], exactStartTime: "19:30" },
      }),
      context.request.get("/api/v1/plans/plan_friday_dinner/ics"),
    ];
    const responses = await Promise.all(deniedCalls);
    for (const response of responses) {
      expect(response.status()).toBe(403);
      expect(await response.text()).not.toMatch(/307683|1\.3204|103\.8436/);
    }
  });

  test("keeps the mobile ballot reachable, capped, and free of horizontal overflow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile layout assertion");
    await page.goto("/plans/plan_friday_dinner");
    await expect(page.getByRole("heading", { name: "Pick the places you'd enjoy" })).toBeVisible();

    const selectedCount = page.getByText(/\d+ of 3/).first();
    await expect(selectedCount).toBeVisible();
    const addButtons = page.getByRole("button", { name: /Add .* to your ballot/ });
    while ((await page.getByRole("button", { name: /Remove .* from your ballot/ }).count()) < 3) {
      await addButtons.first().click();
    }
    const blockedChoice = addButtons.first();
    await blockedChoice.click();
    await expect(page.getByRole("status")).toContainText("Choose up to 3 places");
    await expect(blockedChoice).not.toHaveAttribute("aria-pressed", "true");

    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);

    const submit = await page.getByRole("button", { name: "Submit choices" }).boundingBox();
    const navigation = await page.getByRole("navigation", { name: "Mobile navigation" }).boundingBox();
    expect(submit).not.toBeNull();
    expect(navigation).not.toBeNull();
    expect(submit!.y + submit!.height).toBeLessThanOrEqual(navigation!.y + 1);
  });
});
