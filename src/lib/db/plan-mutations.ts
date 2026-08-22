import type { Client } from "@libsql/client";
import { calculateMaxSelections, tallyBallots, validateDecisionOverride } from "@/domain/voting/rules";
import { validatePlanInvite } from "@/lib/auth/invites";
import { generateId } from "@/lib/auth/crypto";

export type SqlExecutor = Pick<Client, "execute">;

export class PlanMutationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const INVALIDATABLE_STATES = new Set(["collecting", "recommending", "voting"]);
const JOINABLE_STATES = new Set(["draft", "collecting"]);

function isBusy(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { code?: string; rawCode?: number };
  return candidate.code === "SQLITE_BUSY" || candidate.rawCode === 5 || /database is locked/i.test(error.message);
}

export async function beginPlanWriteTransaction(database: Client) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await database.transaction("write");
    } catch (error) {
      if (!isBusy(error)) throw error;
      // The local @libsql sqlite3 adapter detaches the active transaction onto
      // its own connection. When a competing BEGIN IMMEDIATE is rejected as
      // SQLITE_BUSY, that failed BEGIN statement can remain attached to the
      // client's replacement connection. Reusing it makes a later COMMIT fail
      // with "SQL statements in progress". Reconnect only that idle, failed
      // local connection before retrying or surfacing the terminal error;
      // remote Turso clients manage their transaction streams and must not be
      // reset here.
      if (database.protocol === "file") database.reconnect();
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  throw new Error("Unable to start a write transaction.");
}

type ReservationKind = "companion" | "guest" | "legacy";

export interface PendingPlanInviteInput {
  id: string;
  planId: string;
  organizerId: string;
  reservationKind: Exclude<ReservationKind, "legacy">;
  reservedUserId: string | null;
  intendedEmailHash: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export function isPlanJoinableState(state: unknown): boolean {
  return JOINABLE_STATES.has(String(state));
}

export async function countPlanSeats(
  tx: SqlExecutor,
  planId: string,
  now: string,
): Promise<{ activeParticipants: number; liveReservations: number; total: number }> {
  const active = await tx.execute({
    sql: "SELECT COUNT(*) AS count FROM plan_participants WHERE plan_id = ?",
    args: [planId],
  });
  const live = await tx.execute({
    sql: `SELECT COUNT(*) AS count
            FROM plan_invites i
            JOIN plans p ON p.id = i.plan_id
           WHERE i.plan_id = ?
             AND p.state IN ('draft', 'collecting')
             AND i.accepted_at IS NULL
             AND i.revoked_at IS NULL
             AND i.superseded_by_invite_id IS NULL
             AND i.reservation_kind IN ('companion', 'guest')
             AND i.intended_email_hash IS NOT NULL
             AND i.expires_at > ?`,
    args: [planId, now],
  });
  const activeParticipants = Number(active.rows[0]?.count ?? 0);
  const liveReservations = Number(live.rows[0]?.count ?? 0);
  return { activeParticipants, liveReservations, total: activeParticipants + liveReservations };
}

export async function assertPlanSeatCapacity(
  tx: SqlExecutor,
  planId: string,
  requestedSeats: number,
  now: string,
): Promise<void> {
  const seats = await countPlanSeats(tx, planId, now);
  if (seats.total + requestedSeats > 3) {
    throw new PlanMutationError(
      "GROUP_FULL",
      "This plan has no remaining seats.",
      409,
    );
  }
}

async function deleteDerivedPlanState(tx: SqlExecutor, planId: string): Promise<void> {
  await tx.execute({
    sql: `DELETE FROM candidate_scores
           WHERE candidate_id IN (
             SELECT c.id
               FROM recommendation_candidates c
               JOIN recommendation_runs r ON r.id = c.run_id
              WHERE r.plan_id = ?
           )`,
    args: [planId],
  });
  await tx.execute({
    sql: `DELETE FROM ballot_selections
           WHERE ballot_id IN (
             SELECT b.id FROM ballots b
             JOIN recommendation_runs r ON r.id = b.run_id
             WHERE r.plan_id = ?
           )`,
    args: [planId],
  });
  await tx.execute({
    sql: `DELETE FROM ballots
           WHERE run_id IN (SELECT id FROM recommendation_runs WHERE plan_id = ?)`,
    args: [planId],
  });
  await tx.execute({
    sql: `DELETE FROM recommendation_candidates
           WHERE run_id IN (SELECT id FROM recommendation_runs WHERE plan_id = ?)`,
    args: [planId],
  });
  await tx.execute({ sql: "DELETE FROM recommendation_runs WHERE plan_id = ?", args: [planId] });
}

export async function invalidatePlanDerivedStateInTransaction(
  tx: SqlExecutor,
  input: { planId: string; actorId: string; reason: string; expectedVersion?: number },
): Promise<{ previousVersion: number; version: number } | null> {
  const result = await tx.execute({
    sql: "SELECT state, version FROM plans WHERE id = ?",
    args: [input.planId],
  });
  const plan = result.rows[0];
  if (!plan || !INVALIDATABLE_STATES.has(String(plan.state))) return null;
  const previousVersion = Number(plan.version);
  if (input.expectedVersion !== undefined && previousVersion !== input.expectedVersion) return null;

  await deleteDerivedPlanState(tx, input.planId);
  const now = new Date().toISOString();
  const update = await tx.execute({
    sql: `UPDATE plans
             SET state = 'collecting', version = ?, updated_at = ?
           WHERE id = ? AND version = ?
             AND state IN ('collecting', 'recommending', 'voting')`,
    args: [previousVersion + 1, now, input.planId, previousVersion],
  });
  if (update.rowsAffected !== 1) return null;
  await tx.execute({
    sql: `INSERT INTO plan_events
            (id, plan_id, event_type, actor_id, payload_json, created_at)
          VALUES (?, ?, 'plan_inputs_invalidated', ?, ?, ?)`,
    args: [
      generateId("event"),
      input.planId,
      input.actorId,
      JSON.stringify({ reason: input.reason, previousVersion, version: previousVersion + 1 }),
      now,
    ],
  });
  return { previousVersion, version: previousVersion + 1 };
}

export async function assertPlanAcceptingParticipants(
  tx: SqlExecutor,
  planId: string,
): Promise<void> {
  const result = await tx.execute({ sql: "SELECT state FROM plans WHERE id = ?", args: [planId] });
  if (!result.rows[0] || !isPlanJoinableState(result.rows[0].state)) {
    throw new PlanMutationError(
      "INVALID_STATE",
      "Invitations can only be accepted while a plan is being collected.",
      409,
    );
  }
}

export async function insertPlanInviteIfOpen(
  executor: SqlExecutor,
  input: {
    id: string;
    planId: string;
    organizerId: string;
    email?: string | null;
    reservationKind?: Exclude<ReservationKind, "legacy">;
    reservedUserId?: string | null;
    intendedEmailHash?: string | null;
    tokenHash: string;
    expiresAt: string;
    createdAt: string;
  },
): Promise<void> {
  const plan = await executor.execute({
    sql: "SELECT organizer_id AS organizerId, state FROM plans WHERE id = ?",
    args: [input.planId],
  });
  const planRow = plan.rows[0];
  if (!planRow || String(planRow.organizerId) !== input.organizerId) {
    throw new PlanMutationError("FORBIDDEN", "Only the organizer can reserve a plan seat.", 403);
  }
  if (!isPlanJoinableState(planRow.state)) {
    throw new PlanMutationError(
      "INVALID_STATE",
      "Invitations can only be created while a plan is being collected.",
      409,
    );
  }

  const intendedEmailHash = input.intendedEmailHash ?? null;
  const reservedUserId = input.reservedUserId ?? null;
  const reservationKind = input.reservationKind ?? "guest";
  if (!intendedEmailHash || !["companion", "guest"].includes(reservationKind)) {
    throw new PlanMutationError(
      "INVITE_EMAIL_REQUIRED",
      "A new invitation must be bound to an intended email address.",
      400,
    );
  }

  const now = input.createdAt;
  if (reservedUserId) {
    const activeMember = await executor.execute({
      sql: "SELECT 1 FROM plan_participants WHERE plan_id = ? AND user_id = ? LIMIT 1",
      args: [input.planId, reservedUserId],
    });
    if (activeMember.rows.length > 0) {
      throw new PlanMutationError("ALREADY_MEMBER", "This account is already in the plan.", 409);
    }
  }
  const duplicate = await executor.execute({
    sql: `SELECT 1
            FROM plan_invites
           WHERE plan_id = ?
             AND accepted_at IS NULL
             AND revoked_at IS NULL
             AND superseded_by_invite_id IS NULL
             AND expires_at > ?
             AND (intended_email_hash = ? OR (reserved_user_id IS NOT NULL AND reserved_user_id = ?))
           LIMIT 1`,
    args: [input.planId, now, intendedEmailHash, reservedUserId],
  });
  if (duplicate.rows.length > 0) {
    throw new PlanMutationError(
      "INVITE_ALREADY_PENDING",
      "This diner already has a pending invitation for the plan.",
      409,
    );
  }

  await assertPlanSeatCapacity(executor, input.planId, 1, now);
  const result = await executor.execute({
    sql: `INSERT INTO plan_invites
            (id, plan_id, reservation_kind, reserved_user_id, email,
             intended_email_hash, token_hash, expires_at, accepted_at,
             revoked_at, accepted_user_id, superseded_by_invite_id,
             created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    args: [
      input.id,
      input.planId,
      reservationKind,
      reservedUserId,
      input.email ?? null,
      intendedEmailHash,
      input.tokenHash,
      input.expiresAt,
      input.organizerId,
      input.createdAt,
    ],
  });
  if (result.rowsAffected !== 1) {
    throw new PlanMutationError("INVITE_CREATE_FAILED", "The invitation could not be created.", 409);
  }
}

export interface ClaimedPlanInvite {
  inviteId: string;
  reservationKind: Exclude<ReservationKind, "legacy">;
  reservedUserId: string | null;
  intendedEmailHash: string;
}

/**
 * Claims a live, bound reservation. The caller must perform participant,
 * private-location, availability, and event writes on this same transaction
 * before committing; a rollback restores the reservation for retry.
 */
export async function claimPendingPlanInvite(
  tx: SqlExecutor,
  input: {
    planId: string;
    tokenHash: string;
    userId: string;
    userEmail: string;
    intendedEmailHash: string;
    now: string;
  },
): Promise<ClaimedPlanInvite> {
  const planResult = await tx.execute({
    sql: "SELECT state FROM plans WHERE id = ?",
    args: [input.planId],
  });
  if (!planResult.rows[0] || !isPlanJoinableState(planResult.rows[0].state)) {
    throw new PlanMutationError("INVALID_STATE", "Invitations are closed for this plan.", 409);
  }

  const result = await tx.execute({
    sql: `SELECT id AS inviteId,
                 plan_id AS planId,
                 reservation_kind AS reservationKind,
                 reserved_user_id AS reservedUserId,
                 intended_email_hash AS intendedEmailHash,
                 expires_at AS expiresAt,
                 accepted_at AS acceptedAt,
                 revoked_at AS revokedAt,
                 superseded_by_invite_id AS supersededByInviteId
            FROM plan_invites
           WHERE plan_id = ? AND token_hash = ?`,
    args: [input.planId, input.tokenHash],
  });
  const row = result.rows[0];
  if (!row) throw new PlanMutationError("INVITE_UNAVAILABLE", "This invitation is no longer available.", 403);

  const validation = validatePlanInvite({
    planId: String(row.planId),
    intendedEmailHash: row.intendedEmailHash === null ? null : String(row.intendedEmailHash),
    reservedUserId: row.reservedUserId === null ? null : String(row.reservedUserId),
    expiresAt: String(row.expiresAt),
    acceptedAt: row.acceptedAt === null ? null : String(row.acceptedAt),
    revokedAt: row.revokedAt === null ? null : String(row.revokedAt),
    supersededByInviteId: row.supersededByInviteId === null ? null : String(row.supersededByInviteId),
  }, {
    planId: input.planId,
    userEmail: input.userEmail,
    userId: input.userId,
    intendedEmailHash: input.intendedEmailHash,
    requireBound: true,
    nowMs: Date.parse(input.now),
  });
  if (!validation.valid) {
    throw new PlanMutationError("INVITE_UNAVAILABLE", "This invitation is no longer available.", 403);
  }

  const existing = await tx.execute({
    sql: "SELECT 1 FROM plan_participants WHERE plan_id = ? AND user_id = ? LIMIT 1",
    args: [input.planId, input.userId],
  });
  if (existing.rows.length > 0) {
    throw new PlanMutationError("ALREADY_MEMBER", "This account is already in the plan.", 409);
  }

  const claimed = await tx.execute({
    sql: `UPDATE plan_invites
             SET accepted_at = ?, accepted_user_id = ?
           WHERE plan_id = ? AND token_hash = ?
             AND accepted_at IS NULL
             AND revoked_at IS NULL
             AND superseded_by_invite_id IS NULL
             AND expires_at > ?`,
    args: [input.now, input.userId, input.planId, input.tokenHash, input.now],
  });
  if (claimed.rowsAffected !== 1) {
    throw new PlanMutationError("INVITE_UNAVAILABLE", "This invitation is no longer available.", 403);
  }
  return {
    inviteId: String(row.inviteId),
    reservationKind: String(row.reservationKind) as Exclude<ReservationKind, "legacy">,
    reservedUserId: row.reservedUserId === null ? null : String(row.reservedUserId),
    intendedEmailHash: String(row.intendedEmailHash),
  };
}

export async function supersedePendingPlanInvite(
  tx: SqlExecutor,
  input: {
    planId: string;
    organizerId: string;
    inviteId: string;
    replacementInviteId: string;
    now: string;
  },
): Promise<{
  reservationKind: Exclude<ReservationKind, "legacy">;
  reservedUserId: string | null;
  intendedEmailHash: string;
}> {
  const current = await tx.execute({
    sql: `SELECT reservation_kind AS reservationKind,
                 reserved_user_id AS reservedUserId,
                 intended_email_hash AS intendedEmailHash,
                 accepted_at AS acceptedAt,
                 revoked_at AS revokedAt,
                 superseded_by_invite_id AS supersededByInviteId,
                 expires_at AS expiresAt
            FROM plan_invites
           WHERE id = ? AND plan_id = ? AND created_by = ?`,
    args: [input.inviteId, input.planId, input.organizerId],
  });
  const row = current.rows[0];
  if (!row) throw new PlanMutationError("NOT_FOUND", "Invitation not found.", 404);
  const expiresAtMs = Date.parse(String(row.expiresAt));
  const nowMs = Date.parse(input.now);
  if (
    row.acceptedAt ||
    row.revokedAt ||
    row.supersededByInviteId ||
    !row.intendedEmailHash ||
    !Number.isFinite(expiresAtMs) ||
    !Number.isFinite(nowMs) ||
    expiresAtMs <= nowMs
  ) {
    throw new PlanMutationError("INVITE_TERMINAL", "Only a pending invitation can be reissued.", 409);
  }
  if (!["companion", "guest"].includes(String(row.reservationKind))) {
    throw new PlanMutationError("INVITE_TERMINAL", "Only a pending invitation can be reissued.", 409);
  }

  const updated = await tx.execute({
    sql: `UPDATE plan_invites
             SET revoked_at = ?, superseded_by_invite_id = ?
           WHERE id = ? AND plan_id = ? AND created_by = ?
             AND accepted_at IS NULL AND revoked_at IS NULL
             AND superseded_by_invite_id IS NULL
             AND expires_at > ?`,
    args: [input.now, input.replacementInviteId, input.inviteId, input.planId, input.organizerId, input.now],
  });
  if (updated.rowsAffected !== 1) {
    throw new PlanMutationError("INVITE_TERMINAL", "Only a pending invitation can be reissued.", 409);
  }
  return {
    reservationKind: String(row.reservationKind) as Exclude<ReservationKind, "legacy">,
    reservedUserId: row.reservedUserId === null ? null : String(row.reservedUserId),
    intendedEmailHash: String(row.intendedEmailHash),
  };
}

export async function revokePendingPlanInvite(
  tx: SqlExecutor,
  input: { planId: string; organizerId: string; inviteId: string; now: string },
): Promise<void> {
  const current = await tx.execute({
    sql: `SELECT accepted_at AS acceptedAt,
                 revoked_at AS revokedAt,
                 superseded_by_invite_id AS supersededByInviteId,
                 expires_at AS expiresAt
            FROM plan_invites
           WHERE id = ? AND plan_id = ? AND created_by = ?`,
    args: [input.inviteId, input.planId, input.organizerId],
  });
  const row = current.rows[0];
  const expiresAtMs = Date.parse(String(row?.expiresAt ?? ""));
  const nowMs = Date.parse(input.now);
  if (
    !row ||
    row.acceptedAt ||
    row.revokedAt ||
    row.supersededByInviteId ||
    !Number.isFinite(expiresAtMs) ||
    !Number.isFinite(nowMs) ||
    expiresAtMs <= nowMs
  ) {
    throw new PlanMutationError(
      "INVITE_TERMINAL",
      "Only a pending invitation can be revoked.",
      409,
    );
  }

  const result = await tx.execute({
    sql: `UPDATE plan_invites
             SET revoked_at = ?
           WHERE id = ? AND plan_id = ? AND created_by = ?
             AND accepted_at IS NULL AND revoked_at IS NULL
             AND superseded_by_invite_id IS NULL
             AND expires_at > ?`,
    args: [input.now, input.inviteId, input.planId, input.organizerId, input.now],
  });
  if (result.rowsAffected === 1) return;
  throw new PlanMutationError(
    "INVITE_TERMINAL",
    "Only a pending invitation can be revoked.",
    409,
  );
}

export async function listPlanInviteProjection(
  executor: SqlExecutor,
  planId: string,
  now: string,
): Promise<Array<{
  inviteId: string;
  displayLabel: string;
  reservationKind: string;
  seatState: "pending" | "accepted" | "revoked" | "superseded" | "expired";
  expiresAt: string;
  supersededByInviteId: string | null;
}>> {
  const result = await executor.execute({
    sql: `SELECT i.id AS inviteId,
                 i.reservation_kind AS reservationKind,
                 i.expires_at AS expiresAt,
                 i.accepted_at AS acceptedAt,
                 i.revoked_at AS revokedAt,
                 i.superseded_by_invite_id AS supersededByInviteId,
                 p.display_name AS displayLabel
            FROM plan_invites i
            LEFT JOIN profiles p ON p.id = i.reserved_user_id
           WHERE i.plan_id = ?
           ORDER BY i.created_at, i.id`,
    args: [planId],
  });
  return result.rows.map((row) => {
    const expiresAt = String(row.expiresAt);
    const seatState = row.acceptedAt
      ? "accepted"
      : row.supersededByInviteId
        ? "superseded"
        : row.revokedAt
          ? "revoked"
          : Date.parse(expiresAt) <= Date.parse(now)
            ? "expired"
            : "pending";
    return {
      inviteId: String(row.inviteId),
      displayLabel: row.displayLabel === null ? "Invited diner" : String(row.displayLabel),
      reservationKind: String(row.reservationKind),
      seatState,
      expiresAt,
      supersededByInviteId: row.supersededByInviteId === null ? null : String(row.supersededByInviteId),
    };
  });
}

export type PlanInputChanges = Partial<{
  date: string;
  windowStart: string;
  windowEnd: string;
  mealType: string;
  groupBudgetCents: number;
  alcoholMode: string;
  fairnessMode: string;
}>;

const PLAN_CHANGE_COLUMNS: Record<keyof PlanInputChanges, string> = {
  date: "date",
  windowStart: "window_start",
  windowEnd: "window_end",
  mealType: "meal_type",
  groupBudgetCents: "group_budget_cents",
  alcoholMode: "alcohol_mode",
  fairnessMode: "fairness_mode",
};

export async function updatePlanInputsAtomically(
  database: Client,
  input: {
    planId: string;
    organizerId: string;
    expectedVersion: number;
    changes: PlanInputChanges;
    reason: string;
  },
): Promise<Record<string, unknown>> {
  const tx = await beginPlanWriteTransaction(database);
  try {
    const selected = await tx.execute({
      sql: "SELECT * FROM plans WHERE id = ? AND organizer_id = ?",
      args: [input.planId, input.organizerId],
    });
    const plan = selected.rows[0];
    if (!plan) throw new PlanMutationError("FORBIDDEN", "Only the organizer can edit this plan.", 403);
    if (Number(plan.version) !== input.expectedVersion) {
      throw new PlanMutationError("PLAN_VERSION_CONFLICT", "This plan changed in another tab. Reload before editing it again.", 409);
    }
    if (!INVALIDATABLE_STATES.has(String(plan.state))) {
      throw new PlanMutationError("INVALID_STATE", "Locked plans cannot change their planning inputs.", 409);
    }

    const changeEntries = Object.entries(input.changes).filter((entry): entry is [keyof PlanInputChanges, string | number] => entry[1] !== undefined);
    if (changeEntries.length === 0) {
      await tx.commit();
      return { ...plan };
    }

    await deleteDerivedPlanState(tx, input.planId);
    await tx.execute({
      sql: "UPDATE plan_participants SET is_ready = 0, dietary_declared = 0 WHERE plan_id = ?",
      args: [input.planId],
    });
    const now = new Date().toISOString();
    const assignments = changeEntries.map(([key]) => `${PLAN_CHANGE_COLUMNS[key]} = ?`);
    const nextVersion = input.expectedVersion + 1;
    const updated = await tx.execute({
      sql: `UPDATE plans
               SET ${assignments.join(", ")}, state = 'collecting', version = ?, updated_at = ?
             WHERE id = ? AND organizer_id = ? AND version = ?
               AND state IN ('collecting', 'recommending', 'voting')`,
      args: [
        ...changeEntries.map(([, value]) => value),
        nextVersion,
        now,
        input.planId,
        input.organizerId,
        input.expectedVersion,
      ],
    });
    if (updated.rowsAffected !== 1) {
      throw new PlanMutationError("PLAN_VERSION_CONFLICT", "This plan changed in another tab. Reload before editing it again.", 409);
    }
    await tx.execute({
      sql: `INSERT INTO plan_events
              (id, plan_id, event_type, actor_id, payload_json, created_at)
            VALUES (?, ?, 'plan_inputs_invalidated', ?, ?, ?)`,
      args: [
        generateId("event"),
        input.planId,
        input.organizerId,
        JSON.stringify({ reason: input.reason, previousVersion: input.expectedVersion, version: nextVersion }),
        now,
      ],
    });
    const current = await tx.execute({ sql: "SELECT * FROM plans WHERE id = ?", args: [input.planId] });
    await tx.commit();
    return { ...current.rows[0] };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

export async function saveCurrentBallot(
  database: Client,
  input: { planId: string; userId: string; candidateIds: string[]; now: string },
): Promise<{ ballotId: string; tally: ReturnType<typeof tallyBallots> }> {
  const tx = await beginPlanWriteTransaction(database);
  try {
    const planResult = await tx.execute({
      sql: `SELECT p.state, p.version, p.organizer_id AS organizerId,
                   EXISTS(SELECT 1 FROM plan_participants pp WHERE pp.plan_id = p.id AND pp.user_id = ?) AS isMember
              FROM plans p WHERE p.id = ?`,
      args: [input.userId, input.planId],
    });
    const plan = planResult.rows[0];
    if (!plan || (String(plan.organizerId) !== input.userId && Number(plan.isMember) !== 1)) {
      throw new PlanMutationError("FORBIDDEN", "You are not a participant in this plan.", 403);
    }
    if (String(plan.state) !== "voting") {
      throw new PlanMutationError("INVALID_STATE", "Voting is not currently open for this plan.", 409);
    }
    const runResult = await tx.execute({
      sql: `SELECT id FROM recommendation_runs
             WHERE plan_id = ? AND status = 'completed' AND plan_version = ?
             ORDER BY created_at DESC LIMIT 1`,
      args: [input.planId, Number(plan.version)],
    });
    const runId = runResult.rows[0] ? String(runResult.rows[0].id) : null;
    if (!runId) throw new PlanMutationError("NOT_FOUND", "No active recommendation run found.", 404);

    const candidateResult = await tx.execute({
      sql: "SELECT id FROM recommendation_candidates WHERE run_id = ? ORDER BY rank",
      args: [runId],
    });
    const candidateIds = candidateResult.rows.map((row) => String(row.id));
    if (input.candidateIds.some((id) => !candidateIds.includes(id))) {
      throw new PlanMutationError("INVALID_SELECTION", "A selected candidate is not part of this shortlist.", 400);
    }
    if (input.candidateIds.length > calculateMaxSelections(candidateIds.length)) {
      throw new PlanMutationError("MAX_SELECTIONS_EXCEEDED", "Too many shortlist options were selected.", 400);
    }

    const ballotId = generateId("bal");
    await tx.execute({
      sql: `INSERT INTO ballots (id, plan_id, run_id, user_id, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(plan_id, run_id, user_id) DO UPDATE SET updated_at = excluded.updated_at`,
      args: [ballotId, input.planId, runId, input.userId, input.now],
    });
    const persistedBallot = await tx.execute({
      sql: "SELECT id FROM ballots WHERE plan_id = ? AND run_id = ? AND user_id = ?",
      args: [input.planId, runId, input.userId],
    });
    const persistedBallotId = String(persistedBallot.rows[0].id);
    await tx.execute({ sql: "DELETE FROM ballot_selections WHERE ballot_id = ?", args: [persistedBallotId] });
    for (const candidateId of input.candidateIds) {
      await tx.execute({
        sql: "INSERT INTO ballot_selections (id, ballot_id, candidate_id) VALUES (?, ?, ?)",
        args: [generateId("bs"), persistedBallotId, candidateId],
      });
    }

    const rows = await tx.execute({
      sql: `SELECT b.user_id AS userId, bs.candidate_id AS candidateId
              FROM ballots b
              LEFT JOIN ballot_selections bs ON bs.ballot_id = b.id
             WHERE b.run_id = ?`,
      args: [runId],
    });
    const selectionsByUser = new Map<string, string[]>();
    for (const row of rows.rows) {
      const userId = String(row.userId);
      const selections = selectionsByUser.get(userId) ?? [];
      if (row.candidateId !== null) selections.push(String(row.candidateId));
      selectionsByUser.set(userId, selections);
    }
    const tally = tallyBallots(candidateIds, [...selectionsByUser].map(([userId, selections]) => ({ userId, selections })));
    await tx.commit();
    return { ballotId: persistedBallotId, tally };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

export async function confirmCurrentPlan(
  database: Client,
  input: {
    planId: string;
    organizerId: string;
    candidateId: string;
    exactStartTime: string;
    overrideReason?: string | null;
    now: string;
  },
): Promise<{ decisionId: string; candidate: Record<string, unknown>; isOverride: boolean; overrideReason: string | null }> {
  const tx = await beginPlanWriteTransaction(database);
  try {
    const planResult = await tx.execute({
      sql: "SELECT state, version, window_start AS windowStart, window_end AS windowEnd FROM plans WHERE id = ? AND organizer_id = ?",
      args: [input.planId, input.organizerId],
    });
    const plan = planResult.rows[0];
    if (!plan) throw new PlanMutationError("FORBIDDEN", "Only the organizer can confirm this plan.", 403);
    if (String(plan.state) !== "voting") throw new PlanMutationError("INVALID_STATE", "This plan is not open for confirmation.", 409);
    if (input.exactStartTime < String(plan.windowStart) || input.exactStartTime > String(plan.windowEnd)) {
      throw new PlanMutationError("INVALID_TIME", "Choose a time inside the proposed meal window.", 400);
    }
    const runResult = await tx.execute({
      sql: `SELECT id FROM recommendation_runs
             WHERE plan_id = ? AND status = 'completed' AND plan_version = ?
             ORDER BY created_at DESC LIMIT 1`,
      args: [input.planId, Number(plan.version)],
    });
    const runId = runResult.rows[0] ? String(runResult.rows[0].id) : null;
    if (!runId) throw new PlanMutationError("NOT_FOUND", "No active recommendation run.", 404);
    const candidatesResult = await tx.execute({
      sql: "SELECT * FROM recommendation_candidates WHERE run_id = ? ORDER BY rank",
      args: [runId],
    });
    const candidate = candidatesResult.rows.find((row) => String(row.id) === input.candidateId);
    if (!candidate) throw new PlanMutationError("INVALID_CANDIDATE", "Selected candidate is not in the current shortlist.", 400);

    const ballotRows = await tx.execute({
      sql: `SELECT b.user_id AS userId, bs.candidate_id AS candidateId
              FROM ballots b LEFT JOIN ballot_selections bs ON bs.ballot_id = b.id
             WHERE b.run_id = ?`,
      args: [runId],
    });
    const selectionsByUser = new Map<string, string[]>();
    for (const row of ballotRows.rows) {
      const userId = String(row.userId);
      const selections = selectionsByUser.get(userId) ?? [];
      if (row.candidateId !== null) selections.push(String(row.candidateId));
      selectionsByUser.set(userId, selections);
    }
    const candidateIds = candidatesResult.rows.map((row) => String(row.id));
    const tally = tallyBallots(candidateIds, [...selectionsByUser].map(([userId, selections]) => ({ userId, selections })));
    const override = validateDecisionOverride(input.candidateId, tally.leaders, input.overrideReason);
    if (!override.isValid) {
      throw new PlanMutationError("OVERRIDE_REASON_REQUIRED", override.error ?? "A reason is required for an override.", 400);
    }

    const claimed = await tx.execute({
      sql: "UPDATE plans SET state = 'confirmed', updated_at = ? WHERE id = ? AND organizer_id = ? AND state = 'voting' AND version = ?",
      args: [input.now, input.planId, input.organizerId, Number(plan.version)],
    });
    if (claimed.rowsAffected !== 1) throw new PlanMutationError("PLAN_VERSION_CONFLICT", "This plan changed before it could be confirmed.", 409);
    const decisionId = generateId("dec");
    const trimmedReason = override.isOverride ? input.overrideReason?.trim() ?? null : null;
    await tx.execute({
      sql: `INSERT INTO plan_decisions
              (id, plan_id, candidate_id, exact_start_time, decision_kind, override_reason, decided_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [decisionId, input.planId, input.candidateId, input.exactStartTime, override.isOverride ? "override" : "winner", trimmedReason, input.organizerId, input.now],
    });
    await tx.execute({
      sql: `INSERT INTO plan_events
              (id, plan_id, event_type, actor_id, payload_json, created_at)
            VALUES (?, ?, 'plan_confirmed', ?, ?, ?)`,
      args: [
        generateId("event"),
        input.planId,
        input.organizerId,
        JSON.stringify({ candidateId: input.candidateId, exactStartTime: input.exactStartTime, decisionKind: override.isOverride ? "override" : "winner", planVersion: Number(plan.version) }),
        input.now,
      ],
    });
    await tx.commit();
    return { decisionId, candidate: { ...candidate }, isOverride: override.isOverride, overrideReason: trimmedReason };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
