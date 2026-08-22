import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { client } from "@/lib/db";
import { generateId, generateToken, hashToken } from "@/lib/auth/crypto";
import { requirePlanOrganizer } from "@/lib/auth/plan-access";
import {
  beginPlanWriteTransaction,
  insertPlanInviteIfOpen,
  PlanMutationError,
  supersedePendingPlanInvite,
} from "@/lib/db/plan-mutations";

const INVITE_HOURS = 72;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> },
) {
  const { id: planId, inviteId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);
  const access = await requirePlanOrganizer(planId, user.id);
  if (!access.ok) return apiError(access.code, access.message, access.status);

  const now = new Date().toISOString();
  const replacementInviteId = generateId("inv");
  const token = generateToken(24);
  const expiresAt = new Date(Date.parse(now) + INVITE_HOURS * 60 * 60 * 1000).toISOString();

  try {
    const tx = await beginPlanWriteTransaction(client);
    try {
      const previous = await supersedePendingPlanInvite(tx, {
        planId,
        organizerId: user.id,
        inviteId,
        replacementInviteId,
        now,
      });
      await insertPlanInviteIfOpen(tx, {
        id: replacementInviteId,
        planId,
        organizerId: user.id,
        reservationKind: previous.reservationKind,
        reservedUserId: previous.reservedUserId,
        intendedEmailHash: previous.intendedEmailHash,
        tokenHash: hashToken(token),
        expiresAt,
        createdAt: now,
      });
      await tx.execute({
        sql: `INSERT INTO plan_events
                (id, plan_id, event_type, actor_id, payload_json, created_at)
              VALUES (?, ?, 'invite_reissued', ?, ?, ?)`,
        args: [generateId("event"), planId, user.id, JSON.stringify({ supersededInviteId: inviteId }), now],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const response = apiSuccess({
      inviteId: replacementInviteId,
      inviteUrl: `${appUrl}/join/${token}`,
      expiresAt,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof PlanMutationError) {
      return apiError(error.code, error.message, error.status);
    }
    return apiError("SERVER_ERROR", "The invitation could not be reissued.", 500);
  }
}
