import type { Client } from "@libsql/client";
import { calculateMaxSelections, tallyBallots, validateDecisionOverride } from "@/domain/voting/rules";
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

async function beginWriteTransaction(database: Client) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await database.transaction("write");
    } catch (error) {
      if (!isBusy(error) || attempt === 3) throw error;
      // The local @libsql sqlite3 adapter detaches the active transaction onto
      // its own connection. When a competing BEGIN IMMEDIATE is rejected as
      // SQLITE_BUSY, that failed BEGIN statement can remain attached to the
      // client's replacement connection. Reusing it makes a later COMMIT fail
      // with "SQL statements in progress". Reconnect only that idle, failed
      // local connection before retrying; remote Turso clients manage their
      // transaction streams and must not be reset here.
      if (database.protocol === "file") database.reconnect();
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  throw new Error("Unable to start a write transaction.");
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
  if (!result.rows[0] || !JOINABLE_STATES.has(String(result.rows[0].state))) {
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
    email: string | null;
    tokenHash: string;
    expiresAt: string;
    createdAt: string;
  },
): Promise<void> {
  const result = await executor.execute({
    sql: `INSERT INTO plan_invites
            (id, plan_id, email, token_hash, expires_at, accepted_at, created_by, created_at)
          SELECT ?, id, ?, ?, ?, NULL, ?, ?
            FROM plans
           WHERE id = ? AND organizer_id = ? AND state IN ('draft', 'collecting')`,
    args: [
      input.id,
      input.email,
      input.tokenHash,
      input.expiresAt,
      input.organizerId,
      input.createdAt,
      input.planId,
      input.organizerId,
    ],
  });
  if (result.rowsAffected !== 1) {
    throw new PlanMutationError(
      "INVALID_STATE",
      "Invitations can only be created while a plan is being collected.",
      409,
    );
  }
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
  const tx = await beginWriteTransaction(database);
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
  const tx = await beginWriteTransaction(database);
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
  const tx = await beginWriteTransaction(database);
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
