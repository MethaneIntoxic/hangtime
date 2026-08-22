import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { and, eq, desc } from "drizzle-orm";
import { tallyBallots, calculateMaxSelections } from "@/domain/voting/rules";
import {
  requirePlanMember,
  stripPrivateLocationFields,
} from "@/lib/auth/plan-access";

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
      ? stripPrivateLocationFields({
          ...profile,
          notificationPrefs: JSON.parse(profile.notificationPrefs || "{}"),
        })
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

  // Fetch latest recommendation run
  const latestRun = await db
    .select()
    .from(schema.recommendationRuns)
    .where(eq(schema.recommendationRuns.planId, planId))
    .orderBy(desc(schema.recommendationRuns.createdAt))
    .get();

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
  });
}
