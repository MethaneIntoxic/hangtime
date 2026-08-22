import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { client } from "@/lib/db";
import { generateId, generateToken, hashToken } from "@/lib/auth/crypto";
import { requirePlanOrganizer } from "@/lib/auth/plan-access";
import { insertPlanInviteIfOpen, PlanMutationError } from "@/lib/db/plan-mutations";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body;

    const access = await requirePlanOrganizer(planId, user.id);
    if (!access.ok) {
      return apiError(access.code, access.message, access.status);
    }

    const token = generateToken(24);
    const tokenHash = hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(); // 72 hours

    const inviteId = generateId("inv");
    await insertPlanInviteIfOpen(client, {
      id: inviteId,
      planId,
      organizerId: user.id,
      email: typeof email === "string" && email.trim() ? email.toLowerCase().trim() : null,
      tokenHash,
      expiresAt,
      createdAt: now.toISOString(),
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const inviteUrl = `${appUrl}/join/${token}`;

    return apiSuccess({
      inviteId,
      inviteUrl,
      token,
      expiresAt,
    });
  } catch (err: unknown) {
    if (err instanceof PlanMutationError) {
      return apiError(err.code, err.message, err.status);
    }
    return apiError("SERVER_ERROR", (err as Error).message, 500);
  }
}
