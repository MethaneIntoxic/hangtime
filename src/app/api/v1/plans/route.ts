import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { and, eq, desc } from "drizzle-orm";
import { generateId } from "@/lib/auth/crypto";
import { MealType, AlcoholMode, FairnessMode } from "@/types";
import { stripPrivateLocationFields } from "@/lib/auth/plan-access";
import {
  planningAreaLocation,
  saveParticipantLocation,
  savedProfileLocation,
} from "@/lib/location/service";
import { z } from "zod";

const createPlanSchema = z
  .object({
    mealType: z.enum(["dinner", "lunch", "brunch", "coffee", "drinks"]).default("dinner"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date in YYYY-MM-DD format."),
    windowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid start time.").default("19:00"),
    windowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid end time.").default("21:30"),
    groupBudgetCents: z.number().int().min(4_000).max(40_000).default(14_000),
    alcoholMode: z.enum(["included", "excluded"]).default("excluded"),
    fairnessMode: z.enum(["equal_journeys", "lowest_total_time"]).default("equal_journeys"),
    companionIds: z.array(z.string().min(1).max(128)).min(1).max(2),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.windowEnd <= value.windowStart) {
      context.addIssue({ code: "custom", path: ["windowEnd"], message: "End time must be after start time." });
    }
    if (new Set(value.companionIds).size !== value.companionIds.length) {
      context.addIssue({ code: "custom", path: ["companionIds"], message: "Choose each companion only once." });
    }
  });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  // Find all plans where user is participant
  const participations = await db
    .select()
    .from(schema.planParticipants)
    .where(eq(schema.planParticipants.userId, user.id));

  const planIds = participations.map((p) => p.planId);
  if (planIds.length === 0) {
    return apiSuccess({ plans: [] });
  }

  const allPlans = await db
    .select()
    .from(schema.plans)
    .orderBy(desc(schema.plans.createdAt));

  const userPlans = allPlans.filter((p) => planIds.includes(p.id));

  // Populate participants for each plan
  const populated = [];
  for (const p of userPlans) {
    const parts = await db
      .select()
      .from(schema.planParticipants)
      .where(eq(schema.planParticipants.planId, p.id));

    const participantList = [];
    for (const part of parts) {
      const u = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, part.userId))
        .get();
      participantList.push({
        ...stripPrivateLocationFields(part),
        isReady: Boolean(part.isReady),
        profile: u
          ? stripPrivateLocationFields({
              ...u,
              notificationPrefs: JSON.parse(u.notificationPrefs || "{}"),
            })
          : undefined,
      });
    }

    // Check decision if confirmed
    let decision = undefined;
    if (p.state === "confirmed" || p.state === "completed") {
      const dec = await db
        .select()
        .from(schema.planDecisions)
        .where(eq(schema.planDecisions.planId, p.id))
        .get();
      if (dec) {
        const cand = await db
          .select()
          .from(schema.recommendationCandidates)
          .where(eq(schema.recommendationCandidates.id, dec.candidateId))
          .get();
        decision = {
          ...dec,
          candidate: cand ? {
            ...cand,
            badges: JSON.parse(cand.badgesJson),
            transitEstimates: JSON.parse(cand.transitEstimatesJson),
            dietarySuitability: JSON.parse(cand.dietarySuitabilityJson),
          } : undefined,
        };
      }
    }

    populated.push({
      ...p,
      participants: participantList,
      activeDecision: decision,
    });
  }

  return apiSuccess({ plans: populated });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  try {
    const body = await req.json().catch(() => null);
    const parsed = createPlanSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "INVALID_INPUT",
        "Check the plan details and try again.",
        400,
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    }
    const {
      mealType,
      date,
      windowStart,
      windowEnd,
      groupBudgetCents,
      alcoholMode,
      fairnessMode,
      companionIds,
    } = parsed.data;

    if (companionIds.includes(user.id)) {
      return apiError("INVALID_COMPANION", "You cannot add yourself as a companion.", 400);
    }

    for (const companionId of companionIds) {
      const relationship = await db
        .select({ id: schema.diningCompanions.id })
        .from(schema.diningCompanions)
        .where(
          and(
            eq(schema.diningCompanions.ownerUserId, user.id),
            eq(schema.diningCompanions.companionUserId, companionId),
            eq(schema.diningCompanions.status, "accepted"),
          ),
        )
        .get();
      if (!relationship) {
        return apiError("INVALID_COMPANION", "Choose an accepted dining companion.", 403);
      }
    }

    const now = new Date().toISOString();
    const planId = generateId("plan");

    const organizerLocation =
      await savedProfileLocation(user.id) ?? planningAreaLocation(user.coarseArea);
    if (!organizerLocation) {
      return apiError(
        "LOCATION_REQUIRED",
        "Choose your Singapore planning area before creating a plan.",
        400,
      );
    }

    const companionProfiles = [];
    for (const compId of companionIds) {
      const compUser = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, compId))
        .get();
      if (compUser) companionProfiles.push(compUser);
    }

    // 1. Create plan record
    await db.insert(schema.plans).values({
      id: planId,
      organizerId: user.id,
      state: "collecting",
      version: 1,
      date,
      windowStart,
      windowEnd,
      mealType: mealType as MealType,
      groupBudgetCents: Number(groupBudgetCents),
      alcoholMode: alcoholMode as AlcoholMode,
      fairnessMode: fairnessMode as FairnessMode,
      timezone: "Asia/Singapore",
      shortlistSize: 5,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Add organizer as participant (marked ready if coarse area exists)
    const organizerParticipantId = generateId("part");
    await db.insert(schema.planParticipants).values({
      id: organizerParticipantId,
      planId,
      userId: user.id,
      role: "organizer",
      coarseOriginLabel: user.coarseArea || "Central (Novena)",
      isReady: 1,
      acknowledgedState: "pending",
      joinedAt: now,
    });
    await saveParticipantLocation(
      { participantId: organizerParticipantId, userId: user.id, planId },
      organizerLocation,
    );

    // 3. Add invited companions
    for (const compUser of companionProfiles) {
        const participantId = generateId("part");
        const companionLocation =
          await savedProfileLocation(compUser.id) ?? planningAreaLocation(compUser.coarseArea);
        await db.insert(schema.planParticipants).values({
          id: participantId,
          planId,
          userId: compUser.id,
          role: "member",
          coarseOriginLabel: compUser.coarseArea || "Jurong East (West)",
          isReady: companionLocation ? 1 : 0,
          acknowledgedState: "pending",
          joinedAt: now,
        });
        if (companionLocation) {
          await saveParticipantLocation(
            { participantId, userId: compUser.id, planId },
            companionLocation,
          );
        }
    }

    // Log plan event
    await db.insert(schema.planEvents).values({
      id: generateId("event"),
      planId,
      eventType: "plan_created",
      actorId: user.id,
      payloadJson: JSON.stringify({ mealType, date, groupBudgetCents }),
      createdAt: now,
    });

    return apiSuccess({ planId }, 201);
  } catch {
    return apiError("SERVER_ERROR", "The meal plan could not be created.", 500);
  }
}
