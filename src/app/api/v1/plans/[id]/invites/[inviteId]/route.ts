import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { client } from "@/lib/db";
import { generateId } from "@/lib/auth/crypto";
import { requirePlanOrganizer } from "@/lib/auth/plan-access";
import {
  beginPlanWriteTransaction,
  PlanMutationError,
  revokePendingPlanInvite,
} from "@/lib/db/plan-mutations";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> },
) {
  const { id: planId, inviteId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);
  const access = await requirePlanOrganizer(planId, user.id);
  if (!access.ok) return apiError(access.code, access.message, access.status);

  const now = new Date().toISOString();
  try {
    const tx = await beginPlanWriteTransaction(client);
    try {
      await revokePendingPlanInvite(tx, { planId, organizerId: user.id, inviteId, now });
      await tx.execute({
        sql: `INSERT INTO plan_events
                (id, plan_id, event_type, actor_id, payload_json, created_at)
              VALUES (?, ?, 'invite_revoked', ?, ?, ?)`,
        args: [generateId("event"), planId, user.id, JSON.stringify({ inviteId }), now],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
    return apiSuccess({ success: true });
  } catch (error) {
    if (error instanceof PlanMutationError) {
      return apiError(error.code, error.message, error.status);
    }
    return apiError("SERVER_ERROR", "The invitation could not be revoked.", 500);
  }
}
