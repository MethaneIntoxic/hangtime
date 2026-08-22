import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
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

    const { satisfactionScore, reuseIntent, notes } = await req.json();

    if (!satisfactionScore || satisfactionScore < 1 || satisfactionScore > 5) {
      return apiError("INVALID_SCORE", "satisfactionScore must be between 1 and 5", 400);
    }

    const now = new Date().toISOString();

    // Check existing feedback
    const existing = await db
      .select()
      .from(schema.feedback)
      .where(
        and(
          eq(schema.feedback.planId, planId),
          eq(schema.feedback.userId, user.id)
        )
      )
      .get();

    if (existing) {
      await db
        .update(schema.feedback)
        .set({
          satisfactionScore: Number(satisfactionScore),
          reuseIntent: reuseIntent ? 1 : 0,
          notes: notes || null,
        })
        .where(eq(schema.feedback.id, existing.id));
    } else {
      await db.insert(schema.feedback).values({
        id: generateId("fb"),
        planId,
        userId: user.id,
        satisfactionScore: Number(satisfactionScore),
        reuseIntent: reuseIntent ? 1 : 0,
        notes: notes || null,
        createdAt: now,
      });
    }

    return apiSuccess({ success: true });
  } catch (err: unknown) {
    return apiError("SERVER_ERROR", (err as Error).message, 500);
  }
}
