import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { generateId } from "@/lib/auth/crypto";
import { requirePlanOrganizer } from "@/lib/auth/plan-access";

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

  const now = new Date().toISOString();
  await db
    .update(schema.plans)
    .set({
      state: "voting",
      updatedAt: now,
    })
    .where(eq(schema.plans.id, planId));

  await db.insert(schema.planEvents).values({
    id: generateId("event"),
    planId,
    eventType: "voting_opened",
    actorId: user.id,
    createdAt: now,
  });

  return apiSuccess({ success: true, state: "voting" });
}
