import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { generateId } from "@/lib/auth/crypto";
import { tallyBallots, validateDecisionOverride } from "@/domain/voting/rules";
import { requirePlanOrganizer } from "@/lib/auth/plan-access";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  try {
    const body = await req.json().catch(() => null);
    const { candidateId, exactStartTime, overrideReason } = body ?? {};

    if (
      typeof candidateId !== "string" ||
      !candidateId ||
      typeof exactStartTime !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(exactStartTime) ||
      (overrideReason !== undefined && overrideReason !== null && typeof overrideReason !== "string")
    ) {
      return apiError("INVALID_INPUT", "Choose a valid shortlist option and time.", 400);
    }

    const access = await requirePlanOrganizer(planId, user.id);
    if (!access.ok) {
      return apiError(access.code, access.message, access.status);
    }
    if (access.plan.state !== "voting") {
      return apiError("INVALID_STATE", "This plan is not open for confirmation.", 409);
    }
    if (exactStartTime < access.plan.windowStart || exactStartTime > access.plan.windowEnd) {
      return apiError("INVALID_TIME", "Choose a time inside the proposed meal window.", 400);
    }
    // Fetch latest run & candidates
    const run = await db
      .select()
      .from(schema.recommendationRuns)
      .where(eq(schema.recommendationRuns.planId, planId))
      .orderBy(desc(schema.recommendationRuns.createdAt))
      .get();

    if (!run) return apiError("NOT_FOUND", "No active recommendation run.", 404);

    const candidates = await db
      .select()
      .from(schema.recommendationCandidates)
      .where(eq(schema.recommendationCandidates.runId, run.id));

    const targetCandidate = candidates.find((c) => c.id === candidateId);
    if (!targetCandidate) {
      return apiError("INVALID_CANDIDATE", "Selected candidate is not in the shortlist.", 400);
    }

    // Tally ballots to check leaders
    const allBallots = await db
      .select()
      .from(schema.ballots)
      .where(eq(schema.ballots.runId, run.id));

    const ballotsWithSelections = [];
    for (const b of allBallots) {
      const selections = await db
        .select()
        .from(schema.ballotSelections)
        .where(eq(schema.ballotSelections.ballotId, b.id));
      ballotsWithSelections.push({
        userId: b.userId,
        selections: selections.map((s) => s.candidateId),
      });
    }

    const tally = tallyBallots(
      candidates.map((c) => c.id),
      ballotsWithSelections
    );

    // Validate override
    const overrideValidation = validateDecisionOverride(
      candidateId,
      tally.leaders,
      overrideReason
    );

    if (!overrideValidation.isValid) {
      return apiError(
        "OVERRIDE_REASON_REQUIRED",
        overrideValidation.error || "A 10–240 character explanation is required when choosing a non-leading option.",
        400
      );
    }

    const now = new Date().toISOString();

    // Record decision
    const decisionId = generateId("dec");
    await db.insert(schema.planDecisions).values({
      id: decisionId,
      planId,
      candidateId,
      exactStartTime,
      decisionKind: overrideValidation.isOverride ? "override" : "winner",
      overrideReason: overrideValidation.isOverride ? overrideReason.trim() : null,
      decidedBy: user.id,
      createdAt: now,
    });

    // Update plan state to 'confirmed'
    await db
      .update(schema.plans)
      .set({
        state: "confirmed",
        updatedAt: now,
      })
      .where(eq(schema.plans.id, planId));

    // Log Event
    await db.insert(schema.planEvents).values({
      id: generateId("event"),
      planId,
      eventType: "plan_confirmed",
      actorId: user.id,
      payloadJson: JSON.stringify({
        candidateId,
        exactStartTime,
        decisionKind: overrideValidation.isOverride ? "override" : "winner",
      }),
      createdAt: now,
    });

    return apiSuccess({
      decisionId,
      confirmedVenue: {
        id: targetCandidate.id,
        name: targetCandidate.name,
        address: targetCandidate.address,
        exactStartTime,
        isOverride: overrideValidation.isOverride,
        overrideReason: overrideValidation.isOverride ? overrideReason.trim() : null,
      },
    });
  } catch {
    return apiError("SERVER_ERROR", "The plan could not be confirmed.", 500);
  }
}
