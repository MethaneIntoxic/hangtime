import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "@/lib/auth/crypto";
import { calculateMaxSelections, tallyBallots } from "@/domain/voting/rules";
import { requirePlanMember } from "@/lib/auth/plan-access";

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

    if (!run) {
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

    // Transactionally update ballot
    let ballot = await db
      .select()
      .from(schema.ballots)
      .where(
        and(
          eq(schema.ballots.planId, planId),
          eq(schema.ballots.runId, run.id),
          eq(schema.ballots.userId, user.id)
        )
      )
      .get();

    if (!ballot) {
      const ballotId = generateId("bal");
      await db.insert(schema.ballots).values({
        id: ballotId,
        planId,
        runId: run.id,
        userId: user.id,
        updatedAt: now,
      });
      ballot = { id: ballotId, planId, runId: run.id, userId: user.id, updatedAt: now };
    } else {
      await db
        .update(schema.ballots)
        .set({ updatedAt: now })
        .where(eq(schema.ballots.id, ballot.id));

      await db
        .delete(schema.ballotSelections)
        .where(eq(schema.ballotSelections.ballotId, ballot.id));
    }

    if (candidateIds.length > 0) {
      await db.insert(schema.ballotSelections).values(
        candidateIds.map((cId: string) => ({
          id: generateId("bs"),
          ballotId: ballot!.id,
          candidateId: cId,
        }))
      );
    }

    // Compute updated tally
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

    return apiSuccess({
      ballot: {
        id: ballot.id,
        userId: user.id,
        selections: candidateIds,
      },
      tally,
    });
  } catch {
    return apiError("SERVER_ERROR", "Your ballot could not be saved.", 500);
  }
}
