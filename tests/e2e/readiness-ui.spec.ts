import { expect, test } from "@playwright/test";

test.describe("deliberate readiness checklist", () => {
  test("requires every field, sends readiness payloads, and invalidates on edits", async ({ page }) => {
    const participationBodies: Array<Record<string, unknown>> = [];
    const plan = {
      id: "readiness-hermetic",
      organizerId: "user_maya",
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
    };
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
    let participant = {
      id: "part_maya",
      planId: plan.id,
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
      availability: [] as Array<Record<string, unknown>>,
    };

    const json = (data: unknown) => ({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data, requestId: "readiness-hermetic-request" }),
    });

    await page.route("**/api/v1/me", (route) => route.fulfill(json({ profile })));
    await page.route("**/api/v1/plans/readiness-hermetic", (route) => route.fulfill(json({
      plan,
      isOrganizer: true,
      isParticipant: true,
      participants: [participant, {
        ...participant,
        id: "part_ethan",
        userId: "user_ethan",
        role: "member",
        profile: { ...profile, id: "user_ethan", displayName: "Ethan Tan" },
        isReady: false,
      }],
      currentRun: null,
      maxSelections: 1,
      ballots: [],
      userBallot: null,
      tally: null,
      activeDecision: null,
      userFeedback: null,
    })));
    await page.route("**/api/v1/plans/readiness-hermetic/participation", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      participationBodies.push(body);
      const availability = Array.isArray(body.availability)
        ? body.availability.map((window, index) => ({ ...(window as Record<string, unknown>), id: `avail_${index}`, participantId: participant.id, planId: plan.id }))
        : participant.availability;
      participant = {
        ...participant,
        coarseOriginLabel: typeof body.coarseOriginLabel === "string" ? body.coarseOriginLabel : participant.coarseOriginLabel,
        isReady: body.isReady === true,
        dietaryDeclared: body.dietaryDeclared === true,
        availability,
      };
      await route.fulfill(json({ success: true, isReady: participant.isReady }));
    });

    await page.goto("/plans/readiness-hermetic");
    await expect(page.getByRole("heading", { name: "Readiness checklist" })).toBeVisible();
    const readyButton = page.getByRole("button", { name: "Mark me ready" });
    await expect(readyButton).toBeDisabled();
    await expect(page.getByText("Add at least one valid window within 18:30–20:30.")).toBeVisible();
    await expect(page.getByText("Confirm that your dietary rules and preferences are reviewed for this plan.")).toBeVisible();

    await page.getByRole("button", { name: "Add availability window" }).click();
    await page.getByRole("checkbox", { name: /reviewed my dietary rules/i }).check();
    const areaRequest = page.waitForRequest((request) => {
      if (!request.url().endsWith("/participation")) return false;
      const body = request.postDataJSON() as Record<string, unknown>;
      return body.coarseOriginLabel === "Bugis / City Hall (Central)";
    });
    await page.getByRole("combobox", { name: "Coarse planning area" }).selectOption({ label: "Bugis / City Hall (Central)" });
    const areaPayload = (await areaRequest).postDataJSON() as Record<string, unknown>;
    expect(areaPayload).toMatchObject({
      coarseOriginLabel: "Bugis / City Hall (Central)",
      isReady: false,
      dietaryDeclared: true,
    });

    await expect(readyButton).toBeEnabled();
    const readyRequest = page.waitForRequest((request) => {
      if (!request.url().endsWith("/participation")) return false;
      const body = request.postDataJSON() as Record<string, unknown>;
      return body.isReady === true;
    });
    await readyButton.click();
    const readyPayload = (await readyRequest).postDataJSON() as Record<string, unknown>;
    expect(readyPayload).toMatchObject({
      coarseOriginLabel: "Bugis / City Hall (Central)",
      isReady: true,
      dietaryDeclared: true,
      availability: [{ startTime: "18:30", endTime: "20:30", source: "manual" }],
    });
    await expect(page.getByRole("button", { name: "Mark me not ready" })).toBeVisible();

    const invalidateRequest = page.waitForRequest((request) => {
      if (!request.url().endsWith("/participation")) return false;
      const body = request.postDataJSON() as Record<string, unknown>;
      return body.isReady === false && body.availability !== undefined;
    });
    await page.getByLabel("Until").first().fill("20:00");
    const invalidatePayload = (await invalidateRequest).postDataJSON() as Record<string, unknown>;
    expect(invalidatePayload).toMatchObject({ isReady: false, dietaryDeclared: true });
    await expect(page.getByRole("button", { name: "Mark me ready" })).toBeVisible();
    expect(participationBodies.some((body) => body.isReady === true)).toBe(true);
    expect(participationBodies.some((body) => body.isReady === false)).toBe(true);
  });
});
