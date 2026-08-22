import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { generateId } from "@/lib/auth/crypto";
import { generateRecommendations, ParticipantPlanningInput } from "@/domain/recommendations/scorer";
import { MealType, AlcoholMode, FairnessMode, DietarySeverity } from "@/types";
import { requirePlanOrganizer } from "@/lib/auth/plan-access";
import { savedParticipantLocation } from "@/lib/location/service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  const access = await requirePlanOrganizer(planId, user.id);
  if (!access.ok) {
    return apiError(access.code, access.message, access.status);
  }
  const plan = access.plan;

  // Fetch participants
  const participants = await db
    .select()
    .from(schema.planParticipants)
    .where(eq(schema.planParticipants.planId, planId));

  if (participants.length < 2) {
    return apiError(
      "INSUFFICIENT_PARTICIPANTS",
      "At least 2 diners are required to generate recommendations.",
      400
    );
  }

  // Construct planning inputs
  const planningInputs: ParticipantPlanningInput[] = [];
  for (const p of participants) {
    const profile = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, p.userId))
      .get();

    const rawDietaryRules = await db
      .select()
      .from(schema.dietaryRules)
      .where(eq(schema.dietaryRules.userId, p.userId));

    const dietaryRules = rawDietaryRules.map((r) => ({
      ...r,
      severity: r.severity as DietarySeverity,
    }));

    const cuisinePreferences = await db
      .select()
      .from(schema.cuisinePreferences)
      .where(eq(schema.cuisinePreferences.userId, p.userId));

    const preciseLocation = await savedParticipantLocation({
      participantId: p.id,
      userId: p.userId,
      planId,
    });
    if (!preciseLocation || !p.coarseOriginLabel) {
      return apiError(
        "PARTICIPANT_LOCATION_REQUIRED",
        "Every diner must choose a planning area before recommendations can be generated.",
        409,
      );
    }

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
    return apiError(
      "NO_VIABLE_VENUES",
      "No venues matched all strict constraints. Try relaxing dietary filters or expanding your budget.",
      422
    );
  }

  // Insert Run
  await db.insert(schema.recommendationRuns).values({
    id: runId,
    planId,
    planVersion: plan.version + 1,
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

  // Insert Candidates
  for (const c of candidates) {
    await db.insert(schema.recommendationCandidates).values({
      id: c.id,
      runId: c.runId,
      rank: c.rank,
      venueId: c.venueId,
      name: c.name,
      address: c.address,
      coarseArea: c.coarseArea,
      lat: c.lat,
      lng: c.lng,
      cuisine: c.cuisine,
      priceTier: c.priceTier,
      priceRangeMinCents: c.priceRangeMinCents,
      priceRangeMaxCents: c.priceRangeMaxCents,
      rating: c.rating,
      ratingCount: c.ratingCount,
      badgesJson: JSON.stringify(c.badges),
      transitEstimatesJson: JSON.stringify(c.transitEstimates),
      dietarySuitabilityJson: JSON.stringify(c.dietarySuitability),
      bookingUrl: c.bookingUrl,
      mapsUrl: c.mapsUrl,
      whyRecommended: c.whyRecommended,
      createdAt: now,
    });
  }

  // Update plan version & state to 'voting'
  await db
    .update(schema.plans)
    .set({
      state: "voting",
      version: plan.version + 1,
      updatedAt: now,
    })
    .where(eq(schema.plans.id, planId));

  // Log Event
  await db.insert(schema.planEvents).values({
    id: generateId("event"),
    planId,
    eventType: "recommendations_generated",
    actorId: user.id,
    payloadJson: JSON.stringify({ runId, candidateCount: candidates.length }),
    createdAt: now,
  });

  return apiSuccess({
    runId,
    candidates,
    planState: "voting",
  });
}
