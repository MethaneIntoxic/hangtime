import { expect, test, type APIRequestContext } from "@playwright/test";

function futureDate(days = 14) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function switchUser(request: APIRequestContext, userId: string) {
  const response = await request.post("/api/v1/me/switch", { data: { userId } });
  expect(response.status()).toBe(200);
}

async function createPlan(
  request: APIRequestContext,
  companionIds: string[] = ["user_ethan"],
  mealType: "brunch" | "coffee" | "lunch" | "dinner" | "drinks" = "dinner",
) {
  await switchUser(request, "user_maya");
  const response = await request.post("/api/v1/plans", {
    data: {
      mealType,
      date: futureDate(),
      windowStart: "18:30",
      windowEnd: "21:30",
      groupBudgetCents: 16_000,
      alcoholMode: "excluded",
      fairnessMode: "equal_journeys",
      companionIds,
    },
  });
  expect(response.status()).toBe(201);
  const planId = ((await response.json()).data as { planId: string }).planId;
  const created = await getPlan(request, planId);
  expect(created.participants).toHaveLength(1);
  expect(created.participants[0]).toMatchObject({ userId: "user_maya", role: "organizer" });
  expect(created.pendingInvites).toHaveLength(companionIds.length);
  expect(created.seatSummary).toMatchObject({
    joined: 1,
    pending: companionIds.length,
    available: 2 - companionIds.length,
  });
  return planId;
}

async function getPlan(request: APIRequestContext, planId: string) {
  const response = await request.get(`/api/v1/plans/${planId}`);
  expect(response.status()).toBe(200);
  return (await response.json()).data as {
    participants: Array<Record<string, unknown>>;
    currentRun?: { candidates?: Array<Record<string, unknown>> };
    activeDecision?: Record<string, unknown>;
    pendingInvites?: Array<{
      id: string;
      displayName: string;
      status: string;
      expiresAt: string;
    }>;
    seatSummary?: { joined: number; pending: number; available: number };
  };
}

async function currentCompanionDisplayNames(
  request: APIRequestContext,
  companionIds: string[],
): Promise<Map<string, string>> {
  const response = await request.get("/api/v1/companions");
  expect(response.status()).toBe(200);
  const companions = (await response.json()).data.companions as Array<{
    companionId: string;
    displayName: string;
  }>;
  const byId = new Map(companions.map((companion) => [companion.companionId, companion.displayName]));
  for (const companionId of companionIds) {
    expect(byId.has(companionId), `missing current companion record for ${companionId}`).toBe(true);
  }
  return byId;
}

function tokenFromInviteUrl(inviteUrl: unknown): string {
  if (typeof inviteUrl !== "string") {
    throw new Error("reissue did not return an invitation URL");
  }
  let parsed: URL;
  try {
    parsed = new URL(inviteUrl);
  } catch {
    throw new Error("reissue returned an invalid invitation URL");
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  const token = segments[0] === "join" && segments.length === 2 ? segments[1] : undefined;
  if (!token || token.length < 32 || parsed.search || parsed.hash) {
    throw new Error("reissue returned an invalid invitation URL shape");
  }
  return token;
}

async function reissueInviteToken(request: APIRequestContext, planId: string, inviteId: string): Promise<string> {
  const response = await request.post(`/api/v1/plans/${planId}/invites/${inviteId}/reissue`);
  expect(response.status()).toBe(200);
  const data = (await response.json()).data as { inviteUrl?: unknown };
  return tokenFromInviteUrl(data.inviteUrl);
}

async function acceptSelectedCompanions(
  request: APIRequestContext,
  planId: string,
  companionIds: string[],
) {
  await switchUser(request, "user_maya");
  const plan = await getPlan(request, planId);
  const pendingInvites = plan.pendingInvites ?? [];
  const companionNames = await currentCompanionDisplayNames(request, companionIds);
  const tokens: string[] = [];

  for (const userId of companionIds) {
    const displayName = companionNames.get(userId);
    const pendingInvite = pendingInvites.find((invite) => invite.displayName === displayName);
    expect(pendingInvite, `missing pending reservation for ${userId}`).toBeDefined();
    const token = await reissueInviteToken(request, planId, String(pendingInvite?.id));
    tokens.push(token);

    await switchUser(request, userId);
    const readiness = participantReadiness[userId];
    expect(readiness, `missing readiness fixture for ${userId}`).toBeDefined();
    const accepted = await request.put(`/api/v1/plans/${planId}/participation`, {
      data: {
        inviteToken: token,
        coarseOriginLabel: readiness.area,
        dietaryDeclared: true,
        isReady: true,
        availability: [{ startTime: readiness.startTime, endTime: readiness.endTime, source: "manual" }],
      },
    });
    expect(accepted.status(), `invitation acceptance failed for ${userId}`).toBe(200);
    await switchUser(request, "user_maya");
  }

  expect(new Set(tokens).size).toBe(tokens.length);
  const after = await getPlan(request, planId);
  expect(after.pendingInvites).toHaveLength(0);
  expect(after.seatSummary).toMatchObject({
    joined: 1 + companionIds.length,
    pending: 0,
    available: 2 - companionIds.length,
  });
}

const participantReadiness: Record<string, { area: string; startTime: string; endTime: string }> = {
  user_maya: {
    area: "Novena / Balestier (Central)",
    startTime: "18:30",
    endTime: "21:00",
  },
  user_ethan: {
    area: "Jurong East / Clementi (West)",
    startTime: "19:00",
    endTime: "21:30",
  },
  user_clara: {
    area: "Tampines / Pasir Ris (East)",
    startTime: "18:45",
    endTime: "21:15",
  },
};

async function markAllParticipantsReady(request: APIRequestContext, planId: string) {
  const plan = await getPlan(request, planId);
  const organizer = plan.participants.find((participant) => participant.role === "organizer");
  expect(organizer?.userId).toEqual(expect.any(String));

  for (const participant of plan.participants) {
    const userId = String(participant.userId);
    const readiness = participantReadiness[userId];
    expect(readiness, `missing readiness fixture for ${userId}`).toBeDefined();

    await switchUser(request, userId);
    const detailsResponse = await request.put(`/api/v1/plans/${planId}/participation`, {
      data: {
        coarseOriginLabel: readiness.area,
        dietaryDeclared: true,
        availability: [{
          startTime: readiness.startTime,
          endTime: readiness.endTime,
          source: "manual",
        }],
      },
    });
    expect(detailsResponse.status(), `readiness details update failed for ${userId}`).toBe(200);

    // Availability/origin edits intentionally clear readiness. Confirm the
    // complete state in a second request once those details are persisted.
    const readyResponse = await request.put(`/api/v1/plans/${planId}/participation`, {
      data: { dietaryDeclared: true, isReady: true },
    });
    expect(readyResponse.status(), `readiness confirmation failed for ${userId}`).toBe(200);
    expect((await readyResponse.json()).data).toMatchObject({ success: true, isReady: true });
  }

  await switchUser(request, String(organizer?.userId));
  const readyPlan = await getPlan(request, planId);
  expect(readyPlan.participants.every((participant) => participant.isReady === true), "every active participant must be ready").toBe(true);
}

test.describe("Hangtime API acceptance and privacy boundaries", () => {
  test("keeps selected companions pending until accepted and exposes no precise location fields", async ({ context }) => {
    const tooMany = await context.request.post("/api/v1/plans", {
      data: {
        date: futureDate(),
        windowStart: "18:30",
        windowEnd: "21:30",
        groupBudgetCents: 16_000,
        companionIds: ["user_ethan", "user_clara", "user_ethan"],
      },
    });
    expect(tooMany.status()).toBe(400);

    const planId = await createPlan(context.request, ["user_ethan", "user_clara"]);
    const pendingPlan = await getPlan(context.request, planId);
    expect(pendingPlan.participants).toHaveLength(1);
    expect(pendingPlan.pendingInvites).toHaveLength(2);
    expect(pendingPlan.seatSummary).toEqual({ joined: 1, pending: 2, available: 0 });

    await acceptSelectedCompanions(context.request, planId, ["user_ethan", "user_clara"]);
    const plan = await getPlan(context.request, planId);
    expect(plan.participants).toHaveLength(3);
    expect(plan.seatSummary).toEqual({ joined: 3, pending: 0, available: 0 });
    for (const participant of plan.participants) {
      expect(participant).not.toHaveProperty("postalCode");
      expect(participant).not.toHaveProperty("lat");
      expect(participant).not.toHaveProperty("lng");
      const profile = participant.profile as Record<string, unknown> | undefined;
      expect(profile).not.toHaveProperty("postalCode");
      expect(profile).not.toHaveProperty("lat");
      expect(profile).not.toHaveProperty("lng");
    }
  });

  test("atomically consumes the final-seat invite under concurrent acceptance", async ({ context }) => {
    const planId = await createPlan(context.request);
    await acceptSelectedCompanions(context.request, planId, ["user_ethan"]);

    const inviteResponse = await context.request.post(`/api/v1/plans/${planId}/invites`, {
      data: { email: "clara@dinnertime.sg" },
    });
    expect(inviteResponse.status()).toBe(201);
    const pendingInvite = (await inviteResponse.json()).data as {
      inviteId: string;
      expiresAt: string;
      reservationState: string;
      token?: unknown;
      inviteUrl?: unknown;
    };
    expect(pendingInvite).toMatchObject({
      inviteId: expect.any(String),
      expiresAt: expect.any(String),
      reservationState: "pending",
    });
    expect(pendingInvite).not.toHaveProperty("token");
    expect(pendingInvite).not.toHaveProperty("inviteUrl");
    const pendingPlan = await getPlan(context.request, planId);
    expect(pendingPlan.seatSummary).toEqual({ joined: 2, pending: 1, available: 0 });
    expect(pendingPlan.pendingInvites).toHaveLength(1);
    const token = await reissueInviteToken(context.request, planId, pendingInvite.inviteId);

    await switchUser(context.request, "user_clara");
    const joinBody = {
      inviteToken: token,
      coarseOriginLabel: "Tampines / Pasir Ris (East)",
      dietaryDeclared: true,
      isReady: true,
      availability: [{ startTime: "18:30", endTime: "21:30", source: "manual" }],
    };
    const responses = await Promise.all([
      context.request.put(`/api/v1/plans/${planId}/participation`, { data: joinBody }),
      context.request.put(`/api/v1/plans/${planId}/participation`, { data: joinBody }),
    ]);
    const statuses = responses.map((response) => response.status()).sort((a, b) => a - b);
    // The first request consumes the invite. A racing retry may either observe
    // the consumed token (403) or the now-existing member (idempotent 200),
    // but it must never create a fourth participant.
    expect(statuses[0]).toBe(200);
    expect([200, 403]).toContain(statuses[1]);

    const plan = await getPlan(context.request, planId);
    expect(plan.participants).toHaveLength(3);
  });

  test("replaces availability windows atomically and rejects malformed schedules", async ({ context }) => {
    const planId = await createPlan(context.request);
    const first = await context.request.put(`/api/v1/plans/${planId}/participation`, {
      data: {
        coarseOriginLabel: "Novena / Balestier (Central)",
        dietaryDeclared: true,
        isReady: true,
        availability: [
          { startTime: "18:30", endTime: "19:30", source: "manual" },
          { startTime: "20:00", endTime: "21:30", source: "calendar" },
        ],
      },
    });
    expect(first.status()).toBe(200);

    let plan = await getPlan(context.request, planId);
    const organizer = plan.participants.find((participant) => participant.role === "organizer");
    expect(organizer?.availability).toEqual(expect.arrayContaining([
      expect.objectContaining({ startTime: "18:30", endTime: "19:30", source: "manual" }),
      expect.objectContaining({ startTime: "20:00", endTime: "21:30", source: "calendar" }),
    ]));

    const malformed = await context.request.put(`/api/v1/plans/${planId}/participation`, {
      data: {
        dietaryDeclared: true,
        isReady: true,
        availability: [{ startTime: "25:00", endTime: "26:00", source: "manual" }],
      },
    });
    expect(malformed.status()).toBe(400);

    const replacement = await context.request.put(`/api/v1/plans/${planId}/participation`, {
      data: {
        dietaryDeclared: true,
        isReady: true,
        availability: [{ startTime: "19:00", endTime: "20:30", source: "manual" }],
      },
    });
    expect(replacement.status()).toBe(200);
    plan = await getPlan(context.request, planId);
    const updatedOrganizer = plan.participants.find((participant) => participant.role === "organizer");
    expect(updatedOrganizer?.availability).toEqual([
      expect.objectContaining({ startTime: "19:00", endTime: "20:30", source: "manual" }),
    ]);
  });

  test("generates explainable recommendations without precise origins or unbounded links", async ({ context }) => {
    const planId = await createPlan(context.request);
    await acceptSelectedCompanions(context.request, planId, ["user_ethan"]);
    await markAllParticipantsReady(context.request, planId);
    const recommendationResponse = await context.request.post(`/api/v1/plans/${planId}/recommendations`);
    expect(recommendationResponse.status()).toBe(200);
    const payload = (await recommendationResponse.json()).data as {
      candidates: Array<Record<string, unknown>>;
      planState: string;
    };
    expect(payload.planState).toBe("voting");
    expect(payload.candidates.length).toBeGreaterThanOrEqual(3);

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("307683");
    expect(serialized).not.toContain("609731");
    expect(serialized).not.toContain("1.3204");
    expect(serialized).not.toContain("1.3329");
    for (const candidate of payload.candidates) {
      expect(candidate.whyRecommended).toEqual(expect.any(String));
      expect(candidate.mapsUrl).toMatch(/^https:\/\/www\.openstreetmap\.org\//);
      expect(candidate.bookingUrl).toMatch(/^https:\/\//);
      const estimates = candidate.transitEstimates as Array<Record<string, unknown>>;
      expect(estimates.length).toBe(2);
      for (const estimate of estimates) {
        expect(estimate.originCoarseArea).toEqual(expect.any(String));
        expect(estimate).not.toHaveProperty("lat");
        expect(estimate).not.toHaveProperty("lng");
        expect(estimate).not.toHaveProperty("postalCode");
      }
      const dietary = candidate.dietarySuitability as Array<Record<string, unknown>>;
      expect(dietary.every((item) =>
        ["verified", "reported_compatible", "caution", "incompatible"].includes(String(item.status)) &&
        typeof item.note === "string" && item.note.length > 0,
      )).toBe(true);
    }
  });

  test("preserves ballot usability when the live map provider is unavailable", async ({ page }) => {
    await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
    const requestedUrls: string[] = [];
    page.on("request", (request) => requestedUrls.push(request.url()));

    await page.goto("/plans/plan_friday_dinner");
    await expect(page.getByText(/Basic map fallback/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Interactive map of recommended Singapore venues" })).toBeVisible();
    await expect(page.getByLabel("Venue shortlist and ballot controls")).toBeVisible();
    expect(requestedUrls.every((url) => !/307683|609731|origin|postalCode/i.test(url))).toBe(true);
  });

  test("does not call a style-only map ready while vector tiles are still pending", async ({ page }) => {
    await page.route("https://tiles.openfreemap.org/planet/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      await route.abort();
    });

    await page.goto("/plans/plan_friday_dinner");
    await expect(page.getByText("Loading the open map…")).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText(/Map ready with/)).toBeHidden();
    await expect(page.getByText(/Basic map fallback/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Venue shortlist and ballot controls")).toBeVisible();
  });

  test("records organizer override reason and emits a private-location-free ICS download", async ({ context }) => {
    const planId = await createPlan(context.request);
    await acceptSelectedCompanions(context.request, planId, ["user_ethan"]);
    await markAllParticipantsReady(context.request, planId);
    const generated = await context.request.post(`/api/v1/plans/${planId}/recommendations`);
    expect(generated.status()).toBe(200);
    const candidates = ((await generated.json()).data as { candidates: Array<{ id: string }> }).candidates;
    expect(candidates.length).toBeGreaterThanOrEqual(2);

    const ballot = await context.request.put(`/api/v1/plans/${planId}/ballot`, {
      data: { candidateIds: [candidates[0].id] },
    });
    expect(ballot.status()).toBe(200);

    const reason = "The second venue has a quieter room and suits the group better.";
    const confirmation = await context.request.post(`/api/v1/plans/${planId}/confirm`, {
      data: { candidateId: candidates[1].id, exactStartTime: "20:00", overrideReason: `  ${reason}  ` },
    });
    expect(confirmation.status()).toBe(200);
    expect((await confirmation.json()).data.confirmedVenue).toMatchObject({
      isOverride: true,
      overrideReason: reason,
    });

    const repeated = await context.request.post(`/api/v1/plans/${planId}/confirm`, {
      data: { candidateId: candidates[1].id, exactStartTime: "20:00", overrideReason: reason },
    });
    expect(repeated.status()).toBe(409);

    const plan = await getPlan(context.request, planId);
    expect(plan.activeDecision).toMatchObject({
      decisionKind: "override",
      overrideReason: reason,
    });

    const ics = await context.request.get(`/api/v1/plans/${planId}/ics`);
    expect(ics.status()).toBe(200);
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    const icsText = await ics.text();
    expect(icsText).toContain("TZID=Asia/Singapore");
    expect(icsText).toContain("STATUS:CONFIRMED");
    expect(icsText).not.toMatch(/307683|609731|1\.3204|1\.3329|103\.8436|103\.7436/);
  });
});
