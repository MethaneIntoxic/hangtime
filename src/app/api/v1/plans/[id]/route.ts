import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { and, eq, desc } from "drizzle-orm";
import { tallyBallots, calculateMaxSelections } from "@/domain/voting/rules";
import {
  requirePlanMember,
  requirePlanOrganizer,
  stripParticipantProfileFields,
  stripPrivateLocationFields,
} from "@/lib/auth/plan-access";
import { client } from "@/lib/db";
import {
  countPlanSeats,
  listPlanInviteProjection,
  PlanMutationError,
  updatePlanInputsAtomically,
} from "@/lib/db/plan-mutations";
import { z } from "zod";

const planUpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  windowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  windowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  mealType: z.enum(["dinner", "lunch", "brunch", "coffee", "drinks"]).optional(),
  groupBudgetCents: z.number().int().min(4_000).max(40_000).optional(),
  alcoholMode: z.enum(["included", "excluded"]).optional(),
  fairnessMode: z.enum(["equal_journeys", "lowest_total_time"]).optional(),
}).strict().superRefine((value, context) => {
  if (value.windowStart && value.windowEnd && value.windowEnd <= value.windowStart) {
    context.addIssue({ code: "custom", path: ["windowEnd"], message: "End time must be after start time." });
  }
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  const access = await requirePlanMember(planId, user.id);
  if (!access.ok) {
    return apiError(access.code, access.message, access.status);
  }
  const plan = access.plan;

  // Fetch participants with profiles, dietary rules, cuisine preferences, availability
  const rawParticipants = await db
    .select()
    .from(schema.planParticipants)
    .where(eq(schema.planParticipants.planId, planId));

  const participants = [];
  for (const part of rawParticipants) {
    const profile = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, part.userId))
      .get();

    const dietaryRules = await db
      .select()
      .from(schema.dietaryRules)
      .where(eq(schema.dietaryRules.userId, part.userId));

    const cuisinePreferences = await db
      .select()
      .from(schema.cuisinePreferences)
      .where(eq(schema.cuisinePreferences.userId, part.userId));

    const availability = await db
      .select()
      .from(schema.availabilityWindows)
      .where(eq(schema.availabilityWindows.participantId, part.id));

    const safeProfile = profile
      ? stripParticipantProfileFields({
          ...profile,
          notificationPrefs: JSON.parse(profile.notificationPrefs || "{}"),
        }, user.id, part.userId)
      : undefined;
    participants.push({
      ...stripPrivateLocationFields(part),
      isReady: Boolean(part.isReady),
      profile: safeProfile,
      dietaryRules,
      cuisinePreferences,
      availability,
    });
  }

  const isParticipant = true;
  const isOrganizer = access.isOrganizer;
  const inviteNow = new Date().toISOString();
  const rawSeatSummary = isOrganizer ? await countPlanSeats(client, planId, inviteNow) : undefined;
  const seatSummary = rawSeatSummary
    ? {
        joined: rawSeatSummary.activeParticipants,
        pending: rawSeatSummary.liveReservations,
        available: Math.max(0, 3 - rawSeatSummary.total),
      }
    : undefined;
  const pendingInvites = isOrganizer
    ? (await listPlanInviteProjection(client, planId, inviteNow))
        .filter((invite) => invite.seatState === "pending")
        .map((invite) => ({
          id: invite.inviteId,
          displayName: invite.displayLabel,
          status: "pending" as const,
          expiresAt: invite.expiresAt,
        }))
    : undefined;

  // Fetch latest recommendation run
  const latestRunCandidate = await db
    .select()
    .from(schema.recommendationRuns)
    .where(eq(schema.recommendationRuns.planId, planId))
    .orderBy(desc(schema.recommendationRuns.createdAt))
    .get();
  const latestRun = latestRunCandidate && latestRunCandidate.status === "completed" && latestRunCandidate.planVersion === plan.version
    ? latestRunCandidate
    : undefined;

  let candidates: ReturnType<typeof JSON.parse>[] = [];
  const ballotsList = [];
  let tally = null;
  let userBallot = null;
  let maxSelections = 1;

  if (latestRun) {
    const rawCandidates = await db
      .select()
      .from(schema.recommendationCandidates)
      .where(eq(schema.recommendationCandidates.runId, latestRun.id));

    candidates = rawCandidates.map((c) => ({
      ...c,
      badges: JSON.parse(c.badgesJson),
      transitEstimates: JSON.parse(c.transitEstimatesJson),
      dietarySuitability: JSON.parse(c.dietarySuitabilityJson),
    }));

    maxSelections = calculateMaxSelections(candidates.length);

    // Fetch ballots for this run
    const rawBallots = await db
      .select()
      .from(schema.ballots)
      .where(eq(schema.ballots.runId, latestRun.id));

    for (const b of rawBallots) {
      const selections = await db
        .select()
        .from(schema.ballotSelections)
        .where(eq(schema.ballotSelections.ballotId, b.id));

      const selIds = selections.map((s) => s.candidateId);
      ballotsList.push({
        ...b,
        selections: selIds,
      });

      if (b.userId === user.id) {
        userBallot = { ...b, selections: selIds };
      }
    }

    tally = tallyBallots(
      candidates.map((c) => c.id),
      ballotsList
    );
  }

  // Fetch decision if any
  const rawDecision = await db
    .select()
    .from(schema.planDecisions)
    .where(eq(schema.planDecisions.planId, planId))
    .get();

  let activeDecision = undefined;
  if (rawDecision) {
    const chosenCandidate = candidates.find((c) => c.id === rawDecision.candidateId);
    activeDecision = {
      ...rawDecision,
      candidate: chosenCandidate,
    };
  }

  // Fetch feedback if any for this user
  const userFeedback = await db
    .select()
    .from(schema.feedback)
    .where(
      and(
        eq(schema.feedback.planId, planId),
        eq(schema.feedback.userId, user.id)
      )
    )
    .get();

  return apiSuccess({
    plan,
    isOrganizer,
    isParticipant,
    participants,
    currentRun: latestRun ? { ...latestRun, candidates } : null,
    maxSelections,
    ballots: ballotsList,
    userBallot,
    tally,
    activeDecision,
    userFeedback: userFeedback ? {
      ...userFeedback,
      reuseIntent: Boolean(userFeedback.reuseIntent),
    } : null,
    ...(isOrganizer ? { pendingInvites, seatSummary } : {}),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);
  const access = await requirePlanOrganizer(planId, user.id);
  if (!access.ok) return apiError(access.code, access.message, access.status);

  try {
    const parsed = planUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("INVALID_INPUT", "Check the plan details and try again.", 400);
    const { expectedVersion, ...changes } = parsed.data;
    const current = access.plan;
    const effectiveWindowStart = changes.windowStart ?? current.windowStart;
    const effectiveWindowEnd = changes.windowEnd ?? current.windowEnd;
    if (effectiveWindowEnd <= effectiveWindowStart) {
      return apiError("INVALID_INPUT", "End time must be after start time.", 400, { windowEnd: ["End time must be after start time."] });
    }
    if (expectedVersion !== current.version) {
      return apiError("PLAN_VERSION_CONFLICT", "This plan changed in another tab. Reload before editing it again.", 409);
    }
    const changedFields = (Object.keys(changes) as Array<keyof typeof changes>)
      .filter((field) => changes[field] !== undefined && changes[field] !== current[field as keyof typeof current]);
    if (changedFields.length === 0) return apiSuccess({ plan: current, invalidated: false });
    if (["confirmed", "completed", "cancelled"].includes(current.state)) {
      return apiError("INVALID_STATE", "Locked plans cannot change their planning inputs.", 409);
    }
    await updatePlanInputsAtomically(client, {
      planId,
      organizerId: user.id,
      expectedVersion,
      changes,
      reason: `plan_${changedFields.join("_")}_changed`,
    });
    const updated = await db.select().from(schema.plans).where(eq(schema.plans.id, planId)).get();
    return apiSuccess({ plan: updated, invalidated: true });
  } catch (error) {
    if (error instanceof PlanMutationError) {
      return apiError(error.code, error.message, error.status);
    }
    return apiError("SERVER_ERROR", "The plan could not be updated.", 500);
  }
}
