import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { client, db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { calculateMaxSelections } from "@/domain/voting/rules";
import { requirePlanMember } from "@/lib/auth/plan-access";
import { PlanMutationError, saveCurrentBallot } from "@/lib/db/plan-mutations";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  try {
    const body = await req.json().catch(() => null);
    const candidateIds = body?.candidateIds;
    if (
      !Array.isArray(candidateIds) ||
      candidateIds.length === 0 ||
      candidateIds.some((candidateId) => typeof candidateId !== "string" || !candidateId || candidateId.length > 128)
    ) {
      return apiError("INVALID_SELECTION", "Choose at least one valid shortlist option.", 400);
    }
    if (new Set(candidateIds).size !== candidateIds.length) {
      return apiError("DUPLICATE_SELECTION", "Choose each shortlist option only once.", 400);
    }

    const access = await requirePlanMember(planId, user.id);
    if (!access.ok) {
      return apiError(access.code, access.message, access.status);
    }
    const plan = access.plan;
    if (plan.state !== "voting") {
      return apiError("INVALID_STATE", "Voting is not currently open for this plan.", 400);
    }

    // Fetch latest run
    const run = await db
      .select()
      .from(schema.recommendationRuns)
      .where(eq(schema.recommendationRuns.planId, planId))
      .orderBy(desc(schema.recommendationRuns.createdAt))
      .get();

    if (!run || run.status !== "completed" || run.planVersion !== plan.version) {
      return apiError("NOT_FOUND", "No active recommendation run found.", 404);
    }

    const candidates = await db
      .select()
      .from(schema.recommendationCandidates)
      .where(eq(schema.recommendationCandidates.runId, run.id));

    const validCandidateIds = new Set(candidates.map((c) => c.id));
    for (const cId of candidateIds) {
      if (!validCandidateIds.has(cId)) {
        return apiError("INVALID_SELECTION", `Candidate ${cId} is not part of this shortlist.`, 400);
      }
    }

    const maxSelections = calculateMaxSelections(candidates.length);
    if (candidateIds.length > maxSelections) {
      return apiError(
        "MAX_SELECTIONS_EXCEEDED",
        `You can select at most ${maxSelections} options. You selected ${candidateIds.length}.`,
        400
      );
    }

    const now = new Date().toISOString();

    const result = await saveCurrentBallot(client, { planId, userId: user.id, candidateIds, now });

    return apiSuccess({
      ballot: {
        id: result.ballotId,
        userId: user.id,
        selections: candidateIds,
      },
      tally: result.tally,
    });
  } catch (error) {
    if (error instanceof PlanMutationError) {
      return apiError(error.code, error.message, error.status);
    }
    return apiError("SERVER_ERROR", "Your ballot could not be saved.", 500);
  }
}
