import { eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-response";
import { hashToken } from "@/lib/auth/crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { validatePlanInvite } from "@/lib/auth/invites";
import { db, schema } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Sign in to accept this invitation.", 401);

  const { token } = await params;
  const invite = await db
    .select()
    .from(schema.planInvites)
    .where(eq(schema.planInvites.tokenHash, hashToken(token)))
    .get();

  if (!invite) return apiError("INVALID_INVITE", "This invitation is not valid.", 404);

  const validation = validatePlanInvite(invite, {
    planId: invite.planId,
    userEmail: user.email,
  });
  if (!validation.valid) return apiError(validation.code, validation.message, 403);

  const plan = await db.select().from(schema.plans).where(eq(schema.plans.id, invite.planId)).get();
  if (!plan || ["completed", "cancelled"].includes(plan.state)) {
    return apiError("PLAN_UNAVAILABLE", "This meal plan is no longer accepting diners.", 410);
  }
  const organizer = await db
    .select({ displayName: schema.profiles.displayName })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, plan.organizerId))
    .get();

  return apiSuccess({
    plan: {
      id: plan.id,
      mealType: plan.mealType,
      date: plan.date,
      windowStart: plan.windowStart,
      windowEnd: plan.windowEnd,
      organizerDisplayName: organizer?.displayName ?? "A friend",
    },
  });
}
