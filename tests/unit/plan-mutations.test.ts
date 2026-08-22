import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initDatabase } from "@/lib/db/init";
import {
  assertPlanAcceptingParticipants,
  beginPlanWriteTransaction,
  confirmCurrentPlan,
  insertPlanInviteIfOpen,
  invalidatePlanDerivedStateInTransaction,
  PlanMutationError,
  saveCurrentBallot,
  updatePlanInputsAtomically,
} from "@/lib/db/plan-mutations";

let database: Client | undefined;

async function temporaryDatabase(): Promise<Client> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hangtime-plan-mutations-"));
  const db = createClient({ url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` });
  await initDatabase(db);
  database = db;
  return db;
}

afterEach(() => {
  database?.close();
  database = undefined;
});

async function seedVotingPlan(db: Client): Promise<void> {
  const now = "2026-08-22T10:00:00.000Z";
  await db.execute({
    sql: `INSERT INTO plans
            (id, organizer_id, state, version, date, window_start, window_end,
             meal_type, group_budget_cents, alcohol_mode, fairness_mode,
             timezone, shortlist_size, created_at, updated_at)
          VALUES ('plan_1', 'user_org', 'voting', 2, '2026-09-01', '19:00', '21:00',
                  'dinner', 12000, 'excluded', 'equal_journeys',
                  'Asia/Singapore', 5, ?, ?)`,
    args: [now, now],
  });
  await db.execute({
    sql: `INSERT INTO plan_participants
            (id, plan_id, user_id, role, coarse_origin_label, is_ready,
             dietary_declared, acknowledged_state, joined_at)
          VALUES ('part_org', 'plan_1', 'user_org', 'organizer', 'Novena', 1, 1, 'pending', ?)`,
    args: [now],
  });
  await db.execute({
    sql: `INSERT INTO recommendation_runs
            (id, plan_id, plan_version, algorithm_version, status, created_at)
          VALUES ('run_1', 'plan_1', 2, 'v1.0', 'completed', ?)`,
    args: [now],
  });
  for (const [index, candidateId] of ["candidate_1", "candidate_2"].entries()) {
    await db.execute({
      sql: `INSERT INTO recommendation_candidates
              (id, run_id, rank, venue_id, name, address, coarse_area, lat, lng,
               cuisine, price_tier, price_range_min_cents, price_range_max_cents,
               rating, rating_count, badges_json, transit_estimates_json,
               dietary_suitability_json, booking_url, maps_url, why_recommended, created_at)
            VALUES (?, 'run_1', ?, ?, ?, '1 Test Street', 'Central', 1.30, 103.80,
                    'test', 2, 2000, 4000, 4.5, 100, '[]', '[]', '[]', NULL, NULL,
                    'Fits the group', ?)`,
      args: [candidateId, index + 1, `venue_${index + 1}`, `Venue ${index + 1}`, now],
    });
  }
}

describe("atomic plan mutations", () => {
  it("reconnects a local client after every busy attempt, including the terminal failure", async () => {
    vi.useFakeTimers();
    try {
      const busy = Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
      const transaction = vi.fn().mockRejectedValue(busy);
      const reconnect = vi.fn();
      const client = { protocol: "file", transaction, reconnect } as unknown as Client;

      const pending = beginPlanWriteTransaction(client);
      const rejection = expect(pending).rejects.toMatchObject({ code: "SQLITE_BUSY" });
      await vi.runAllTimersAsync();

      await rejection;
      expect(transaction).toHaveBeenCalledTimes(4);
      expect(reconnect).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reconnect or retry a non-busy transaction failure", async () => {
    const transaction = vi.fn().mockRejectedValue(new Error("transaction failed"));
    const reconnect = vi.fn();
    const client = { protocol: "file", transaction, reconnect } as unknown as Client;

    await expect(beginPlanWriteTransaction(client)).rejects.toThrow("transaction failed");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(reconnect).not.toHaveBeenCalled();
  });

  it("confirms only the current version shortlist and commits decision, state, and event together", async () => {
    const db = await temporaryDatabase();
    await seedVotingPlan(db);
    await saveCurrentBallot(db, {
      planId: "plan_1",
      userId: "user_org",
      candidateIds: ["candidate_1"],
      now: "2026-08-22T10:01:00.000Z",
    });

    const confirmed = await confirmCurrentPlan(db, {
      planId: "plan_1",
      organizerId: "user_org",
      candidateId: "candidate_1",
      exactStartTime: "19:30",
      now: "2026-08-22T10:02:00.000Z",
    });
    expect(confirmed.isOverride).toBe(false);
    expect(String((await db.execute("SELECT state FROM plans WHERE id = 'plan_1'")).rows[0].state)).toBe("confirmed");
    expect(Number((await db.execute("SELECT COUNT(*) AS count FROM plan_decisions")).rows[0].count)).toBe(1);
    expect(Number((await db.execute("SELECT COUNT(*) AS count FROM plan_events WHERE event_type = 'plan_confirmed'")).rows[0].count)).toBe(1);
  });

  it("cannot resurrect a decision after the shortlist was invalidated", async () => {
    const db = await temporaryDatabase();
    await seedVotingPlan(db);
    const tx = await db.transaction("write");
    await invalidatePlanDerivedStateInTransaction(tx, {
      planId: "plan_1",
      actorId: "user_org",
      reason: "participant_availability_changed",
    });
    await tx.commit();
    tx.close();

    await expect(confirmCurrentPlan(db, {
      planId: "plan_1",
      organizerId: "user_org",
      candidateId: "candidate_1",
      exactStartTime: "19:30",
      now: "2026-08-22T10:02:00.000Z",
    })).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(Number((await db.execute("SELECT COUNT(*) AS count FROM plan_decisions")).rows[0].count)).toBe(0);
    expect(String((await db.execute("SELECT state FROM plans WHERE id = 'plan_1'")).rows[0].state)).toBe("collecting");
  });

  it("leaves all state untouched on a plan edit version conflict", async () => {
    const db = await temporaryDatabase();
    await seedVotingPlan(db);

    await expect(updatePlanInputsAtomically(db, {
      planId: "plan_1",
      organizerId: "user_org",
      expectedVersion: 1,
      changes: { groupBudgetCents: 18000 },
      reason: "plan_groupBudgetCents_changed",
    })).rejects.toMatchObject({ code: "PLAN_VERSION_CONFLICT" });
    const unchanged = (await db.execute("SELECT state, version, group_budget_cents AS budget FROM plans WHERE id = 'plan_1'")).rows[0];
    expect(unchanged).toMatchObject({ state: "voting", version: 2, budget: 12000 });
    expect(Number((await db.execute("SELECT COUNT(*) AS count FROM recommendation_runs")).rows[0].count)).toBe(1);
    expect(Number((await db.execute("SELECT is_ready AS ready FROM plan_participants")).rows[0].ready)).toBe(1);

    await updatePlanInputsAtomically(db, {
      planId: "plan_1",
      organizerId: "user_org",
      expectedVersion: 2,
      changes: { groupBudgetCents: 18000 },
      reason: "plan_groupBudgetCents_changed",
    });
    const updated = (await db.execute("SELECT state, version, group_budget_cents AS budget FROM plans WHERE id = 'plan_1'")).rows[0];
    expect(updated).toMatchObject({ state: "collecting", version: 3, budget: 18000 });
    expect(Number((await db.execute("SELECT COUNT(*) AS count FROM recommendation_runs")).rows[0].count)).toBe(0);
    expect(Number((await db.execute("SELECT is_ready AS ready FROM plan_participants")).rows[0].ready)).toBe(0);
  });

  it("rechecks the active run before writing a ballot", async () => {
    const db = await temporaryDatabase();
    await seedVotingPlan(db);
    const tx = await db.transaction("write");
    await invalidatePlanDerivedStateInTransaction(tx, {
      planId: "plan_1",
      actorId: "user_org",
      reason: "participant_origin_changed",
    });
    await tx.commit();
    tx.close();

    await expect(saveCurrentBallot(db, {
      planId: "plan_1",
      userId: "user_org",
      candidateIds: ["candidate_1"],
      now: "2026-08-22T10:02:00.000Z",
    })).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(Number((await db.execute("SELECT COUNT(*) AS count FROM ballots")).rows[0].count)).toBe(0);
  });

  it("keeps one ballot per participant under concurrent retries", async () => {
    const db = await temporaryDatabase();
    await seedVotingPlan(db);
    await Promise.all([
      saveCurrentBallot(db, {
        planId: "plan_1", userId: "user_org", candidateIds: ["candidate_1"],
        now: "2026-08-22T10:01:00.000Z",
      }),
      saveCurrentBallot(db, {
        planId: "plan_1", userId: "user_org", candidateIds: ["candidate_2"],
        now: "2026-08-22T10:01:01.000Z",
      }),
    ]);
    expect(Number((await db.execute("SELECT COUNT(*) AS count FROM ballots")).rows[0].count)).toBe(1);
    expect(Number((await db.execute("SELECT COUNT(*) AS count FROM ballot_selections")).rows[0].count)).toBe(1);
  });

  it("rejects invite insertion once collection has closed", async () => {
    const db = await temporaryDatabase();
    await seedVotingPlan(db);
    await expect(insertPlanInviteIfOpen(db, {
      id: "invite_1",
      planId: "plan_1",
      organizerId: "user_org",
      email: null,
      tokenHash: "hash_1",
      expiresAt: "2026-08-25T10:00:00.000Z",
      createdAt: "2026-08-22T10:00:00.000Z",
    })).rejects.toBeInstanceOf(PlanMutationError);
    expect(Number((await db.execute("SELECT COUNT(*) AS count FROM plan_invites")).rows[0].count)).toBe(0);

    const tx = await db.transaction("write");
    await expect(assertPlanAcceptingParticipants(tx, "plan_1")).rejects.toMatchObject({ code: "INVALID_STATE" });
    await tx.rollback();
    tx.close();
  });
});
