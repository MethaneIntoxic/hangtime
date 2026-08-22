import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { and, desc, eq, or } from "drizzle-orm";
import { generateId } from "@/lib/auth/crypto";
import { generateRecommendations, ParticipantPlanningInput } from "@/domain/recommendations/scorer";
import { validateParticipantReadiness } from "@/domain/plans/state-machine";
import { MealType, AlcoholMode, FairnessMode, DietarySeverity } from "@/types";
import { requirePlanOrganizer } from "@/lib/auth/plan-access";
import { savedParticipantLocation } from "@/lib/location/service";

function candidateResponse(candidate: typeof schema.recommendationCandidates.$inferSelect) {
  return {
    ...candidate,
    badges: JSON.parse(candidate.badgesJson),
    transitEstimates: JSON.parse(candidate.transitEstimatesJson),
    dietarySuitability: JSON.parse(candidate.dietarySuitabilityJson),
  };
}

async function existingRunResponse(planId: string, runId: string) {
  const run = await db.select().from(schema.recommendationRuns).where(eq(schema.recommendationRuns.id, runId)).get();
  if (!run) return null;
  const candidates = await db
    .select()
    .from(schema.recommendationCandidates)
    .where(eq(schema.recommendationCandidates.runId, runId));
  return { runId: run.id, candidates: candidates.map(candidateResponse), planState: "voting" as const };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  const access = await requirePlanOrganizer(planId, user.id);
  if (!access.ok) return apiError(access.code, access.message, access.status);
  const plan = access.plan;

  // A completed run at the current plan version is the idempotency record.
  // This also makes a retry after a lost response safe.
  const latestRun = await db
    .select()
    .from(schema.recommendationRuns)
    .where(eq(schema.recommendationRuns.planId, planId))
    .orderBy(desc(schema.recommendationRuns.createdAt))
    .get();
  if (plan.state === "voting" && latestRun?.status === "completed" && latestRun.planVersion === plan.version) {
    const existing = await existingRunResponse(planId, latestRun.id);
    if (existing) return apiSuccess(existing);
  }
  if (!["collecting", "recommending", "voting"].includes(plan.state)) {
    return apiError("INVALID_STATE", "Recommendations are not currently open for this plan.", 409);
  }

  const participants = await db
    .select()
    .from(schema.planParticipants)
    .where(eq(schema.planParticipants.planId, planId));
  if (participants.length < 2) {
    return apiError("INSUFFICIENT_PARTICIPANTS", "At least 2 diners are required to generate recommendations.", 400);
  }

  const planningInputs: ParticipantPlanningInput[] = [];
  const readinessInputs = [];
  for (const p of participants) {
    const profile = await db.select().from(schema.profiles).where(eq(schema.profiles.id, p.userId)).get();
    const rawDietaryRules = await db.select().from(schema.dietaryRules).where(eq(schema.dietaryRules.userId, p.userId));
    const dietaryRules = rawDietaryRules.map((rule) => ({ ...rule, severity: rule.severity as DietarySeverity }));
    const cuisinePreferences = await db.select().from(schema.cuisinePreferences).where(eq(schema.cuisinePreferences.userId, p.userId));
    const availability = await db.select().from(schema.availabilityWindows).where(eq(schema.availabilityWindows.participantId, p.id));
    const preciseLocation = await savedParticipantLocation({ participantId: p.id, userId: p.userId, planId });
    readinessInputs.push({
      userId: p.userId,
      isReady: Boolean(p.isReady),
      coarseOriginLabel: p.coarseOriginLabel,
      preciseLocationAvailable: Boolean(preciseLocation),
      availability,
      dietaryDeclared: Boolean(p.dietaryDeclared),
    });
    if (preciseLocation && p.coarseOriginLabel) {
      planningInputs.push({
        participantId: p.id,
        userId: p.userId,
        displayName: profile?.displayName || "Diner",
        coarseOriginLabel: p.coarseOriginLabel,
        lat: preciseLocation.lat,
        lng: preciseLocation.lng,
        dietaryRules,
        cuisinePreferences,
      });
    }
  }

  const readiness = validateParticipantReadiness(readinessInputs, {
    startTime: plan.windowStart,
    endTime: plan.windowEnd,
  });
  if (!readiness.allReady) {
    return apiError(
      "PARTICIPANTS_NOT_READY",
      "Every diner must confirm a planning area, availability window, and dietary state before recommendations can be generated.",
      409,
      { participants: readiness.unreadyUsers },
    );
  }

  const now = new Date().toISOString();
  const runId = generateId("run");
  const candidates = generateRecommendations({
    runId,
    planId,
    participants: planningInputs,
    mealType: plan.mealType as MealType,
    groupBudgetCents: plan.groupBudgetCents,
    alcoholMode: plan.alcoholMode as AlcoholMode,
    fairnessMode: plan.fairnessMode as FairnessMode,
    shortlistSize: plan.shortlistSize || 5,
  });

  if (candidates.length === 0) {
    return apiError("NO_VIABLE_VENUES", "No venues matched all strict constraints. Try relaxing dietary filters or expanding your budget.", 422);
  }

  const targetVersion = plan.version + 1;
  let committed = false;
  await db.transaction(async (tx) => {
    const claim = await tx
      .update(schema.plans)
      .set({ state: "voting", version: targetVersion, updatedAt: now })
      .where(and(
        eq(schema.plans.id, planId),
        eq(schema.plans.version, plan.version),
        or(eq(schema.plans.state, "collecting"), eq(schema.plans.state, "recommending")),
      ));
    if (claim.rowsAffected !== 1) return;

    await tx.insert(schema.recommendationRuns).values({
      id: runId,
      planId,
      planVersion: targetVersion,
      algorithmVersion: "v1.0",
      status: "completed",
      weightsJson: JSON.stringify({
        fairness: plan.fairnessMode === "equal_journeys" ? 0.3 : 0.2,
        totalTravel: plan.fairnessMode === "equal_journeys" ? 0.2 : 0.3,
        foodMatch: 0.25,
        budgetFit: 0.2,
        quality: 0.05,
      }),
      createdAt: now,
    });
    await tx.insert(schema.recommendationCandidates).values(candidates.map((candidate) => ({
      id: candidate.id,
      runId: candidate.runId,
      rank: candidate.rank,
      venueId: candidate.venueId,
      name: candidate.name,
      address: candidate.address,
      coarseArea: candidate.coarseArea,
      lat: candidate.lat,
      lng: candidate.lng,
      cuisine: candidate.cuisine,
      priceTier: candidate.priceTier,
      priceRangeMinCents: candidate.priceRangeMinCents,
      priceRangeMaxCents: candidate.priceRangeMaxCents,
      rating: candidate.rating,
      ratingCount: candidate.ratingCount,
      badgesJson: JSON.stringify(candidate.badges),
      transitEstimatesJson: JSON.stringify(candidate.transitEstimates),
      dietarySuitabilityJson: JSON.stringify(candidate.dietarySuitability),
      bookingUrl: candidate.bookingUrl,
      mapsUrl: candidate.mapsUrl,
      whyRecommended: candidate.whyRecommended,
      createdAt: now,
    })));
    await tx.insert(schema.planEvents).values({
      id: generateId("event"),
      planId,
      eventType: "recommendations_generated",
      actorId: user.id,
      payloadJson: JSON.stringify({ runId, candidateCount: candidates.length, planVersion: targetVersion }),
      createdAt: now,
    });
    committed = true;
  });

  if (!committed) {
    const current = await db.select().from(schema.plans).where(eq(schema.plans.id, planId)).get();
    const concurrentRun = await db
      .select()
      .from(schema.recommendationRuns)
      .where(eq(schema.recommendationRuns.planId, planId))
      .orderBy(desc(schema.recommendationRuns.createdAt))
      .get();
    if (current?.state === "voting" && concurrentRun?.status === "completed" && concurrentRun.planVersion === current.version) {
      const existing = await existingRunResponse(planId, concurrentRun.id);
      if (existing) return apiSuccess(existing);
    }
    return apiError("PLAN_VERSION_CONFLICT", "This plan changed while recommendations were being generated. Reload and try again.", 409);
  }

  return apiSuccess({ runId, candidates, planState: "voting" });
}
