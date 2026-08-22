import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { client, db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { generateId, hashToken } from "@/lib/auth/crypto";
import { requirePlanMember } from "@/lib/auth/plan-access";
import {
  extractInviteToken,
  validatePlanInvite,
} from "@/lib/auth/invites";
import {
  participantLocationSubject,
  planningAreaLocation,
  privateLocationRepository,
  savedParticipantLocation,
  savedProfileLocation,
} from "@/lib/location/service";
import { z } from "zod";

const participationSchema = z.object({
  coarseOriginLabel: z.string().trim().min(1).max(120).optional(),
  isReady: z.boolean().default(true),
  availability: z.array(z.object({
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    source: z.enum(["manual", "calendar"]).default("manual"),
  }).strict()).max(20).default([]),
  inviteToken: z.string().min(32).max(256).optional(),
}).strict();

type ParticipantRow = typeof schema.planParticipants.$inferSelect;

class JoinPlanError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  try {
    const parsed = participationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError("INVALID_INPUT", "Check the participation details and try again.", 400);
    }
    const { coarseOriginLabel, isReady, availability, inviteToken: bodyInviteToken } = parsed.data;

    const now = new Date().toISOString();
    const access = await requirePlanMember(planId, user.id);
    if (!access.ok && access.code === "NOT_FOUND") {
      return apiError(access.code, access.message, access.status);
    }

    let participant = access.ok ? access.participant : null;

    if (!participant) {
      if (access.ok) {
        return apiError(
          "PARTICIPANT_RECORD_MISSING",
          "The organizer participant record is missing.",
          409
        );
      }

      const inviteToken = extractInviteToken(req, bodyInviteToken);
      if (!inviteToken) {
        return apiError(
          "INVITE_REQUIRED",
          "A valid invitation is required to join this plan.",
          403
        );
      }

      const tokenHash = hashToken(inviteToken);
      const partId = generateId("part");
      const originLabel = coarseOriginLabel || user.coarseArea;
      const preciseLocation = originLabel
        ? planningAreaLocation(originLabel) ?? await savedProfileLocation(user.id)
        : null;
      if (!originLabel || !preciseLocation) {
        return apiError(
          "LOCATION_REQUIRED",
          "Choose a supported Singapore planning area before joining.",
          400,
        );
      }
      try {
        const tx = await client.transaction("write");
        try {
          const inviteResult = await tx.execute({ sql: `
            SELECT plan_id AS planId, email, expires_at AS expiresAt,
                   accepted_at AS acceptedAt
              FROM plan_invites
             WHERE plan_id = ? AND token_hash = ?
          `, args: [planId, tokenHash] });
          const inviteRow = inviteResult.rows[0];
          const invite = inviteRow ? {
            planId: String(inviteRow.planId),
            email: inviteRow.email === null ? null : String(inviteRow.email),
            expiresAt: String(inviteRow.expiresAt),
            acceptedAt: inviteRow.acceptedAt === null ? null : String(inviteRow.acceptedAt),
          } : undefined;
          const validation = validatePlanInvite(invite, {
            planId,
            userEmail: user.email,
            nowMs: Date.parse(now),
          });
          if (!validation.valid) {
            throw new JoinPlanError(validation.code, validation.message, 403);
          }

          const existingResult = await tx.execute({ sql: `
            SELECT id, plan_id AS planId, user_id AS userId, role,
                   coarse_origin_label AS coarseOriginLabel,
                   is_ready AS isReady,
                   acknowledged_state AS acknowledgedState,
                   joined_at AS joinedAt
              FROM plan_participants
             WHERE plan_id = ? AND user_id = ?
          `, args: [planId, user.id] });
          const existingRow = existingResult.rows[0];
          if (existingRow) {
            participant = {
              id: String(existingRow.id), planId: String(existingRow.planId),
              userId: String(existingRow.userId), role: String(existingRow.role) as ParticipantRow["role"],
              coarseOriginLabel: String(existingRow.coarseOriginLabel),
              isReady: Number(existingRow.isReady),
              acknowledgedState: String(existingRow.acknowledgedState) as ParticipantRow["acknowledgedState"],
              joinedAt: String(existingRow.joinedAt),
            };
            await tx.commit();
          } else {

          const countResult = await tx.execute({
            sql: "SELECT COUNT(*) AS participantCount FROM plan_participants WHERE plan_id = ?",
            args: [planId],
          });
          if (Number(countResult.rows[0]?.participantCount ?? 0) >= 3) {
            throw new JoinPlanError(
              "GROUP_FULL",
              "Maximum 3 diners reached for this plan.",
              409
            );
          }

          const consumed = await tx.execute({ sql: `
            UPDATE plan_invites SET accepted_at = ?
             WHERE plan_id = ? AND token_hash = ?
               AND accepted_at IS NULL AND expires_at > ?
          `, args: [now, planId, tokenHash, now] });
          if (consumed.rowsAffected !== 1) {
            throw new JoinPlanError(
              "INVITE_ALREADY_USED",
              "This invitation is no longer valid.",
              403
            );
          }

          const newParticipant: ParticipantRow = {
            id: partId,
            planId,
            userId: user.id,
            role: "member",
            coarseOriginLabel: originLabel,
            isReady: isReady ? 1 : 0,
            acknowledgedState: "pending",
            joinedAt: now,
          };
          await tx.execute({ sql: `
            INSERT INTO plan_participants
              (id, plan_id, user_id, role, coarse_origin_label,
               is_ready, acknowledged_state, joined_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, args: [
              newParticipant.id,
              newParticipant.planId,
              newParticipant.userId,
              newParticipant.role,
              newParticipant.coarseOriginLabel,
              newParticipant.isReady,
              newParticipant.acknowledgedState,
              newParticipant.joinedAt,
            ] });
          await privateLocationRepository(tx).put(
            participantLocationSubject({ participantId: partId, userId: user.id, planId }),
            preciseLocation,
          );
          participant = newParticipant;
          await tx.commit();
          }
        } catch (error) {
          await tx.rollback();
          throw error;
        } finally {
          tx.close();
        }
      } catch (error) {
        if (error instanceof JoinPlanError) {
          return apiError(error.code, error.message, error.status);
        }
        throw error;
      }
    } else {
      const requestedLocation = coarseOriginLabel
        ? planningAreaLocation(coarseOriginLabel)
        : null;
      if (coarseOriginLabel && !requestedLocation) {
        return apiError("INVALID_LOCATION", "Choose a supported Singapore planning area.", 400);
      }
      if (requestedLocation) {
        await privateLocationRepository().put(
          participantLocationSubject({ participantId: participant.id, userId: user.id, planId }),
          requestedLocation,
        );
      }
      const storedLocation =
        requestedLocation ?? await savedParticipantLocation({ participantId: participant.id, userId: user.id, planId });
      if (isReady && !storedLocation) {
        return apiError("LOCATION_REQUIRED", "Choose a planning area before marking ready.", 400);
      }
      await db
        .update(schema.planParticipants)
        .set({
          coarseOriginLabel: coarseOriginLabel !== undefined ? coarseOriginLabel : participant.coarseOriginLabel,
          isReady: isReady ? 1 : 0,
        })
        .where(eq(schema.planParticipants.id, participant.id));
    }

    if (!participant) {
      return apiError("PARTICIPANT_RECORD_MISSING", "Participant setup did not complete.", 409);
    }

    // Update availability windows if passed
    if (Array.isArray(availability)) {
      await db
        .delete(schema.availabilityWindows)
        .where(eq(schema.availabilityWindows.participantId, participant.id));

      if (availability.length > 0) {
        await db.insert(schema.availabilityWindows).values(
          availability.map((w: { startTime: string; endTime: string; source?: "manual" | "calendar" }) => ({
            id: generateId("avail"),
            participantId: participant!.id,
            planId,
            startTime: w.startTime,
            endTime: w.endTime,
            source: w.source || "manual",
          }))
        );
      }
    }

    return apiSuccess({ success: true, isReady: Boolean(isReady) });
  } catch (err: unknown) {
    return apiError("SERVER_ERROR", (err as Error).message, 500);
  }
}
