import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { client } from "@/lib/db";
import { requirePlanOrganizer } from "@/lib/auth/plan-access";
import { confirmCurrentPlan, PlanMutationError } from "@/lib/db/plan-mutations";

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
    const now = new Date().toISOString();
    const confirmed = await confirmCurrentPlan(client, {
      planId,
      organizerId: user.id,
      candidateId,
      exactStartTime,
      overrideReason,
      now,
    });

    return apiSuccess({
      decisionId: confirmed.decisionId,
      confirmedVenue: {
        id: String(confirmed.candidate.id),
        name: String(confirmed.candidate.name),
        address: String(confirmed.candidate.address),
        exactStartTime,
        isOverride: confirmed.isOverride,
        overrideReason: confirmed.overrideReason,
      },
    });
  } catch (error) {
    if (error instanceof PlanMutationError) {
      return apiError(error.code, error.message, error.status);
    }
    return apiError("SERVER_ERROR", "The plan could not be confirmed.", 500);
  }
}
