import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { client, db, schema } from "@/lib/db";
import { sql } from "drizzle-orm";
import { generateId, generateToken, hashToken } from "@/lib/auth/crypto";
import { normalizeEmail, hashIntendedEmail } from "@/lib/auth/request-security";
import { requirePlanOrganizer } from "@/lib/auth/plan-access";
import {
  beginPlanWriteTransaction,
  countPlanSeats,
  insertPlanInviteIfOpen,
  listPlanInviteProjection,
  PlanMutationError,
} from "@/lib/db/plan-mutations";

const inviteSchema = z.object({
  email: z.string().trim().email().max(254),
}).strict();

const INVITE_HOURS = 72;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);
  const access = await requirePlanOrganizer(planId, user.id);
  if (!access.ok) return apiError(access.code, access.message, access.status);

  const now = new Date().toISOString();
  const [rawInvites, rawSeatSummary] = await Promise.all([
    listPlanInviteProjection(client, planId, now),
    countPlanSeats(client, planId, now),
  ]);
  const invites = rawInvites.map((invite) => ({
    id: invite.inviteId,
    displayName: invite.displayLabel,
    status: invite.seatState,
    expiresAt: invite.expiresAt,
  }));
  const seatSummary = {
    joined: rawSeatSummary.activeParticipants,
    pending: rawSeatSummary.liveReservations,
    available: Math.max(0, 3 - rawSeatSummary.total),
  };
  return apiSuccess({ invites, seatSummary });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);
  const access = await requirePlanOrganizer(planId, user.id);
  if (!access.ok) return apiError(access.code, access.message, access.status);

  const parsed = inviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError("INVALID_INPUT", "Provide a valid invitation email address.", 400);
  }

  const email = normalizeEmail(parsed.data.email);
  const profile = await db
    .select({ id: schema.profiles.id })
    .from(schema.profiles)
    .where(sql`lower(trim(${schema.profiles.email})) = ${email}`)
    .get();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.parse(now) + INVITE_HOURS * 60 * 60 * 1000).toISOString();
  const inviteId = generateId("inv");
  const token = generateToken(24);

  try {
    const tx = await beginPlanWriteTransaction(client);
    try {
      await insertPlanInviteIfOpen(tx, {
        id: inviteId,
        planId,
        organizerId: user.id,
        email: null,
        reservationKind: "guest",
        reservedUserId: profile?.id ?? null,
        intendedEmailHash: hashIntendedEmail(email),
        tokenHash: hashToken(token),
        expiresAt,
        createdAt: now,
      });
      await tx.execute({
        sql: `INSERT INTO plan_events
                (id, plan_id, event_type, actor_id, payload_json, created_at)
              VALUES (?, ?, 'invite_created', ?, ?, ?)`,
        args: [generateId("event"), planId, user.id, JSON.stringify({ reservationKind: "guest" }), now],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }

    // Delivery is intentionally outside this API contract; no bearer token
    // or unverified "sent" claim is returned.
    return apiSuccess({ inviteId, expiresAt, reservationState: "pending" }, 201);
  } catch (error) {
    if (error instanceof PlanMutationError) {
      return apiError(error.code, error.message, error.status);
    }
    return apiError("SERVER_ERROR", "The invitation could not be created.", 500);
  }
}
