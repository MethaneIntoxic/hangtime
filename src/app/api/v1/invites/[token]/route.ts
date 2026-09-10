import { eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-response";
import { hashToken } from "@/lib/auth/crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { validatePlanInvite } from "@/lib/auth/invites";
import { hashIntendedEmail } from "@/lib/auth/request-security";
import { db, client, schema } from "@/lib/db";
import { isPlanJoinableState } from "@/lib/db/plan-mutations";

const UNAVAILABLE_MESSAGE = "This invitation is unavailable. Ask the organizer for a new link.";

function unavailable(status = 403) {
  const response = apiError("INVITE_UNAVAILABLE", UNAVAILABLE_MESSAGE, status);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    const response = apiError("UNAUTHORIZED", "Sign in to accept this invitation.", 401);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const { token } = await params;
  const result = await client.execute({
    sql: `SELECT i.plan_id AS planId,
                 i.intended_email_hash AS intendedEmailHash,
                 i.reserved_user_id AS reservedUserId,
                 i.expires_at AS expiresAt,
                 i.accepted_at AS acceptedAt,
                 i.revoked_at AS revokedAt,
                 i.superseded_by_invite_id AS supersededByInviteId,
                 p.state AS planState,
                 p.meal_type AS mealType,
                 p.date AS date,
                 p.window_start AS windowStart,
                 p.window_end AS windowEnd,
                 p.organizer_id AS organizerId
            FROM plan_invites i
            JOIN plans p ON p.id = i.plan_id
           WHERE i.token_hash = ?
           LIMIT 1`,
    args: [hashToken(token)],
  });
  const row = result.rows[0];
  if (!row) return unavailable(403);

  const planId = String(row.planId);
  const validation = validatePlanInvite({
    planId,
    intendedEmailHash: row.intendedEmailHash === null ? null : String(row.intendedEmailHash),
    reservedUserId: row.reservedUserId === null ? null : String(row.reservedUserId),
    expiresAt: String(row.expiresAt),
    acceptedAt: row.acceptedAt === null ? null : String(row.acceptedAt),
    revokedAt: row.revokedAt === null ? null : String(row.revokedAt),
    supersededByInviteId: row.supersededByInviteId === null ? null : String(row.supersededByInviteId),
  }, {
    planId,
    userId: user.id,
    userEmail: user.email,
    intendedEmailHash: hashIntendedEmail(user.email),
    requireBound: true,
    nowMs: Date.now(),
  });
  if (!validation.valid || !isPlanJoinableState(row.planState)) return unavailable(403);

  const organizer = await db
    .select({ displayName: schema.profiles.displayName })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, String(row.organizerId)))
    .get();

  const response = apiSuccess({
    plan: {
      id: planId,
      mealType: String(row.mealType),
      date: String(row.date),
      windowStart: String(row.windowStart),
      windowEnd: String(row.windowEnd),
      organizerDisplayName: organizer?.displayName ?? "A friend",
    },
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
