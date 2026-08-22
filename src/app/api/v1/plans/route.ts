import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { client, db, schema } from "@/lib/db";
import { and, eq, desc } from "drizzle-orm";
import { generateId, generateToken, hashToken } from "@/lib/auth/crypto";
import { stripParticipantProfileFields, stripPrivateLocationFields } from "@/lib/auth/plan-access";
import {
  planningAreaLocation,
  participantLocationSubject,
  privateLocationRepository,
  savedProfileLocation,
} from "@/lib/location/service";
import { hashIntendedEmail } from "@/lib/auth/request-security";
import {
  beginPlanWriteTransaction,
  insertPlanInviteIfOpen,
  PlanMutationError,
} from "@/lib/db/plan-mutations";
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
          ? stripParticipantProfileFields({
              ...u,
              notificationPrefs: JSON.parse(u.notificationPrefs || "{}"),
            }, user.id, part.userId)
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
      if (!compUser || !compUser.email?.trim()) {
        return apiError("INVALID_COMPANION", "Choose an accepted companion with a verified profile.", 403);
      }
      companionProfiles.push(compUser);
    }

    // The organizer is the only accepted participant at creation. Every
    // selected companion consumes a bound, live seat reservation until it is
    // accepted, revoked, superseded, or expired.
    const tx = await beginPlanWriteTransaction(client);
    try {
      await tx.execute({
        sql: `INSERT INTO plans
                (id, organizer_id, state, version, date, window_start, window_end,
                 meal_type, group_budget_cents, alcohol_mode, fairness_mode,
                 timezone, shortlist_size, created_at, updated_at)
              VALUES (?, ?, 'collecting', 1, ?, ?, ?, ?, ?, ?, ?, 'Asia/Singapore', 5, ?, ?)`,
        args: [
          planId,
          user.id,
          date,
          windowStart,
          windowEnd,
          mealType,
          Number(groupBudgetCents),
          alcoholMode,
          fairnessMode,
          now,
          now,
        ],
      });

      const organizerParticipantId = generateId("part");
      await tx.execute({
        sql: `INSERT INTO plan_participants
                (id, plan_id, user_id, role, coarse_origin_label,
                 is_ready, dietary_declared, acknowledged_state, joined_at)
              VALUES (?, ?, ?, 'organizer', ?, 0, 0, 'pending', ?)`,
        args: [
          organizerParticipantId,
          planId,
          user.id,
          user.coarseArea || "Central (Novena)",
          now,
        ],
      });
      await privateLocationRepository(tx).put(
        participantLocationSubject({ participantId: organizerParticipantId, userId: user.id, planId }),
        organizerLocation,
      );

      for (const compUser of companionProfiles) {
        const token = generateToken(24);
        await insertPlanInviteIfOpen(tx, {
          id: generateId("inv"),
          planId,
          organizerId: user.id,
          email: null,
          reservationKind: "companion",
          reservedUserId: compUser.id,
          intendedEmailHash: hashIntendedEmail(compUser.email),
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.parse(now) + 72 * 60 * 60 * 1000).toISOString(),
          createdAt: now,
        });
      }

      await tx.execute({
        sql: `INSERT INTO plan_events
                (id, plan_id, event_type, actor_id, payload_json, created_at)
              VALUES (?, ?, 'plan_created', ?, ?, ?)`,
        args: [
          generateId("event"),
          planId,
          user.id,
          JSON.stringify({ mealType, date, groupBudgetCents }),
          now,
        ],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      if (error instanceof PlanMutationError) {
        return apiError(error.code, error.message, error.status);
      }
      throw error;
    } finally {
      tx.close();
    }

    return apiSuccess({ planId }, 201);
  } catch {
    return apiError("SERVER_ERROR", "The meal plan could not be created.", 500);
  }
}
