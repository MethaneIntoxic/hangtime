import { getCurrentSessionContext, getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { client, schema } from "@/lib/db";
import { generateId, hashToken } from "@/lib/auth/crypto";
import { requirePlanMember } from "@/lib/auth/plan-access";
import {
  extractInviteToken,
} from "@/lib/auth/invites";
import { hashIntendedEmail } from "@/lib/auth/request-security";
import {
  participantLocationSubject,
  planningAreaLocation,
  privateLocationRepository,
  profileLocationSubject,
} from "@/lib/location/service";
import { z } from "zod";
import { hasValidAvailability } from "@/domain/plans/state-machine";
import { sameAvailabilityWindows } from "@/lib/plan-inputs/canonical";
import {
  beginPlanWriteTransaction,
  claimPendingPlanInvite,
  clearPendingInviteForSession,
  countPlanSeats,
  invalidatePlanDerivedStateInTransaction,
  PlanMutationError,
} from "@/lib/db/plan-mutations";

const participationSchema = z.object({
  coarseOriginLabel: z.union([z.string().trim().min(1).max(120), z.null()]).optional(),
  // Readiness is opt-in. Omitting this field preserves the existing state for
  // partial edits, while new invite acceptance always starts incomplete.
  isReady: z.boolean().optional(),
  dietaryDeclared: z.boolean().optional(),
  availability: z.array(z.object({
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    source: z.enum(["manual", "calendar"]).default("manual"),
  }).strict()).max(20).superRefine((windows, context) => {
    for (const [index, window] of windows.entries()) {
      if (!hasValidAvailability([window])) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Each availability window must have an end time after its start time.",
        });
      }
    }
  }).optional(),
  inviteToken: z.string().min(32).max(256).optional(),
}).strict();

type ParticipantRow = typeof schema.planParticipants.$inferSelect;

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;
  const sessionContext = await getCurrentSessionContext();
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  try {
    const parsed = participationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError("INVALID_INPUT", "Check the participation details and try again.", 400);
    }
    const { coarseOriginLabel, isReady, dietaryDeclared, availability, inviteToken: bodyInviteToken } = parsed.data;
    const readyRequested = isReady === true;

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

      const inviteToken = sessionContext?.pendingInviteId ? null : extractInviteToken(req, bodyInviteToken);
      if (!sessionContext?.pendingInviteId && !inviteToken) {
        return apiError(
          "INVITE_REQUIRED",
          "A valid invitation is required to join this plan.",
          403
        );
      }

      const tokenHash = inviteToken ? hashToken(inviteToken) : null;
      const partId = generateId("part");
      const originLabel = coarseOriginLabel || user.coarseArea;
      try {
        const tx = await beginPlanWriteTransaction(client);
        try {
          await claimPendingPlanInvite(tx, {
            planId,
            ...(sessionContext?.pendingInviteId ? { inviteId: sessionContext.pendingInviteId } : { tokenHash: tokenHash! }),
            userId: user.id,
            userEmail: user.email,
            intendedEmailHash: hashIntendedEmail(user.email),
            now,
          });
          const preciseLocation = originLabel
            ? planningAreaLocation(originLabel) ?? await privateLocationRepository(tx).get(profileLocationSubject(user.id))
            : null;
          if (!originLabel || !preciseLocation) {
            throw new PlanMutationError(
              "LOCATION_REQUIRED",
              "Choose a supported Singapore planning area before joining.",
              400,
            );
          }
          if (readyRequested && (!dietaryDeclared || !hasValidAvailability(availability, { startTime: "00:00", endTime: "23:59" }))) {
            throw new PlanMutationError(
              "READINESS_REQUIREMENTS_MISSING",
              "Review dietary state and add a valid availability window before marking ready.",
              400,
            );
          }
          const seats = await countPlanSeats(tx, planId, now);
          if (seats.activeParticipants >= 3) {
            throw new PlanMutationError("GROUP_FULL", "Maximum 3 diners reached for this plan.", 409);
          }

          const newParticipant: ParticipantRow = {
            id: partId,
            planId,
            userId: user.id,
            role: "member",
            coarseOriginLabel: originLabel,
            isReady: readyRequested ? 1 : 0,
            dietaryDeclared: dietaryDeclared ? 1 : 0,
            acknowledgedState: "pending",
            joinedAt: now,
          };
          await tx.execute({ sql: `
            INSERT INTO plan_participants
              (id, plan_id, user_id, role, coarse_origin_label,
               is_ready, dietary_declared, acknowledged_state, joined_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, args: [
              newParticipant.id,
              newParticipant.planId,
              newParticipant.userId,
              newParticipant.role,
              newParticipant.coarseOriginLabel,
              newParticipant.isReady,
              newParticipant.dietaryDeclared,
              newParticipant.acknowledgedState,
              newParticipant.joinedAt,
            ] });
          await privateLocationRepository(tx).put(
            participantLocationSubject({ participantId: partId, userId: user.id, planId }),
            preciseLocation,
          );
          if (availability && availability.length > 0) {
            for (const window of availability) {
              await tx.execute({
                sql: `INSERT INTO availability_windows
                        (id, participant_id, plan_id, start_time, end_time, source)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [generateId("avail"), partId, planId, window.startTime, window.endTime, window.source],
              });
            }
          }
          participant = newParticipant;
          await tx.execute({
            sql: `INSERT INTO plan_events
                    (id, plan_id, event_type, actor_id, payload_json, created_at)
                  VALUES (?, ?, 'invitation_accepted', ?, ?, ?)`,
            args: [
              generateId("event"),
              planId,
              user.id,
              JSON.stringify({ participantId: partId }),
              now,
            ],
          });
          if (sessionContext?.sessionId && sessionContext.pendingInviteId) {
            await clearPendingInviteForSession(tx, {
              sessionId: sessionContext.sessionId,
              inviteId: sessionContext.pendingInviteId,
            });
          }
          await tx.commit();
        } catch (error) {
          await tx.rollback();
          throw error;
        } finally {
          tx.close();
        }
      } catch (error) {
        if (error instanceof PlanMutationError) {
          return apiError(error.code, error.message, error.status);
        }
        throw error;
      }
    } else {
      const currentParticipant = participant;
      if (!currentParticipant) {
        return apiError("PARTICIPANT_RECORD_MISSING", "Participant setup did not complete.", 409);
      }
      const requestedLocation = typeof coarseOriginLabel === "string"
        ? planningAreaLocation(coarseOriginLabel)
        : null;
      if (typeof coarseOriginLabel === "string" && !requestedLocation) {
        return apiError("INVALID_LOCATION", "Choose a supported Singapore planning area.", 400);
      }

      const tx = await beginPlanWriteTransaction(client);
      try {
        const currentResult = await tx.execute({ sql: `
          SELECT pp.id, pp.plan_id AS planId, pp.user_id AS userId, pp.role,
                 pp.coarse_origin_label AS coarseOriginLabel, pp.is_ready AS isReady,
                 pp.dietary_declared AS dietaryDeclared,
                 pp.acknowledged_state AS acknowledgedState, pp.joined_at AS joinedAt,
                 p.state AS planState, p.window_start AS windowStart, p.window_end AS windowEnd
            FROM plan_participants pp
            JOIN plans p ON p.id = pp.plan_id
           WHERE pp.id = ? AND pp.plan_id = ? AND pp.user_id = ?
        `, args: [currentParticipant.id, planId, user.id] });
        const row = currentResult.rows[0];
        if (!row) throw new PlanMutationError("FORBIDDEN", "You are not a participant in this plan.", 403);
        if (!["collecting", "recommending", "voting"].includes(String(row.planState))) {
          throw new PlanMutationError("INVALID_STATE", "Readiness can only change while a plan is being prepared.", 409);
        }
        const persistedParticipant: ParticipantRow = {
          id: String(row.id),
          planId: String(row.planId),
          userId: String(row.userId),
          role: String(row.role) as ParticipantRow["role"],
          coarseOriginLabel: row.coarseOriginLabel === null ? null : String(row.coarseOriginLabel),
          isReady: Number(row.isReady),
          dietaryDeclared: Number(row.dietaryDeclared),
          acknowledgedState: String(row.acknowledgedState) as ParticipantRow["acknowledgedState"],
          joinedAt: String(row.joinedAt),
        };
        const previousAvailabilityResult = await tx.execute({
          sql: "SELECT start_time AS startTime, end_time AS endTime, source FROM availability_windows WHERE participant_id = ? ORDER BY id",
          args: [persistedParticipant.id],
        });
        const previousAvailability = previousAvailabilityResult.rows.map((window) => ({
          startTime: String(window.startTime),
          endTime: String(window.endTime),
          source: String(window.source) as "manual" | "calendar",
        }));
        const nextAvailability = availability ?? previousAvailability;
        const nextDietaryDeclared = dietaryDeclared ?? Boolean(persistedParticipant.dietaryDeclared);
        const nextIsReady = isReady ?? Boolean(persistedParticipant.isReady);
        const subject = participantLocationSubject({ participantId: persistedParticipant.id, userId: user.id, planId });
        const repository = privateLocationRepository(tx);
        const existingLocation = await repository.get(subject);
        const storedLocation = coarseOriginLabel === null ? null : requestedLocation ?? existingLocation;
        if (nextIsReady && (
          !storedLocation ||
          !hasValidAvailability(nextAvailability, { startTime: String(row.windowStart), endTime: String(row.windowEnd) }) ||
          !nextDietaryDeclared
        )) {
          throw new PlanMutationError("READINESS_REQUIREMENTS_MISSING", "Review location, availability, and dietary state before marking ready.", 400);
        }

        const availabilityChanged = availability !== undefined && !sameAvailabilityWindows(availability, previousAvailability);
        const originChanged = coarseOriginLabel !== undefined && coarseOriginLabel !== persistedParticipant.coarseOriginLabel;
        const readinessChanged = nextIsReady !== Boolean(persistedParticipant.isReady) || nextDietaryDeclared !== Boolean(persistedParticipant.dietaryDeclared);
        const invalidatesDerivedState = originChanged || availabilityChanged || (isReady === false && Boolean(persistedParticipant.isReady));
        const persistedReady = invalidatesDerivedState ? false : nextIsReady;

        if (requestedLocation) await repository.put(subject, requestedLocation);
        else if (coarseOriginLabel === null) await repository.delete(subject);
        await tx.execute({
          sql: `UPDATE plan_participants
                   SET coarse_origin_label = ?, is_ready = ?, dietary_declared = ?
                 WHERE id = ? AND plan_id = ? AND user_id = ?`,
          args: [
            coarseOriginLabel !== undefined ? coarseOriginLabel : persistedParticipant.coarseOriginLabel,
            persistedReady ? 1 : 0,
            nextDietaryDeclared ? 1 : 0,
            persistedParticipant.id,
            planId,
            user.id,
          ],
        });
        if (availability !== undefined) {
          await tx.execute({ sql: "DELETE FROM availability_windows WHERE participant_id = ?", args: [persistedParticipant.id] });
          for (const window of availability) {
            await tx.execute({
              sql: `INSERT INTO availability_windows
                      (id, participant_id, plan_id, start_time, end_time, source)
                    VALUES (?, ?, ?, ?, ?, ?)`,
              args: [generateId("avail"), persistedParticipant.id, planId, window.startTime, window.endTime, window.source],
            });
          }
        }
        if (invalidatesDerivedState || readinessChanged) {
          const invalidated = await invalidatePlanDerivedStateInTransaction(tx, {
            planId,
            actorId: user.id,
            reason: originChanged ? "participant_origin_changed" : availabilityChanged ? "participant_availability_changed" : "participant_readiness_changed",
          });
          if (!invalidated) throw new PlanMutationError("PLAN_VERSION_CONFLICT", "This plan changed while readiness was being saved.", 409);
        }
        participant = {
          ...persistedParticipant,
          coarseOriginLabel: coarseOriginLabel !== undefined ? coarseOriginLabel : persistedParticipant.coarseOriginLabel,
          isReady: persistedReady ? 1 : 0,
          dietaryDeclared: nextDietaryDeclared ? 1 : 0,
        };
        await tx.commit();
      } catch (error) {
        try {
          await tx.rollback();
        } catch {
          // Preserve the operation error; finally still closes the transaction.
        }
        throw error;
      } finally {
        tx.close();
      }
    }

    if (!participant) {
      return apiError("PARTICIPANT_RECORD_MISSING", "Participant setup did not complete.", 409);
    }

    return apiSuccess({ success: true, isReady: participant ? Boolean((participant as ParticipantRow).isReady) : readyRequested });
  } catch (err: unknown) {
    if (err instanceof PlanMutationError) {
      return apiError(err.code, err.message, err.status);
    }
    return apiError("SERVER_ERROR", (err as Error).message, 500);
  }
}
