import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { generateId } from "@/lib/auth/crypto";
import { requirePlanMember } from "@/lib/auth/plan-access";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  try {
    const access = await requirePlanMember(planId, user.id);
    if (!access.ok) {
      return apiError(access.code, access.message, access.status);
    }

    const { acknowledgedState } = await req.json(); // 'acknowledged' | 'conflict'

    if (!["acknowledged", "conflict"].includes(acknowledgedState)) {
      return apiError("INVALID_STATE", "acknowledgedState must be 'acknowledged' or 'conflict'", 400);
    }

    const participant = access.participant;
    if (!participant) {
      return apiError("FORBIDDEN", "Participant record is missing.", 403);
    }

    await db
      .update(schema.planParticipants)
      .set({ acknowledgedState })
      .where(eq(schema.planParticipants.id, participant.id));

    const now = new Date().toISOString();
    await db.insert(schema.planEvents).values({
      id: generateId("event"),
      planId,
      eventType: acknowledgedState === "conflict" ? "conflict_flagged" : "plan_acknowledged",
      actorId: user.id,
      createdAt: now,
    });

    return apiSuccess({ success: true, acknowledgedState });
  } catch (err: unknown) {
    return apiError("SERVER_ERROR", (err as Error).message, 500);
  }
}
