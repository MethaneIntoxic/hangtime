import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { validatePlanInvite } from "@/lib/auth/invites";
import { initDatabase } from "@/lib/db/init";
import {
  claimPendingPlanInvite,
  countPlanSeats,
  insertPlanInviteIfOpen,
  revokePendingPlanInvite,
  supersedePendingPlanInvite,
} from "@/lib/db/plan-mutations";

const NOW = "2026-08-22T10:00:00.000Z";
const LATER = "2026-08-25T10:00:00.000Z";
const EXPIRED = "2026-08-21T10:00:00.000Z";

let database: Client | undefined;

async function temporaryDatabase(): Promise<Client> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hangtime-plan-reservations-"));
  const db = createClient({ url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` });
  await initDatabase(db);
  database = db;
  return db;
}

afterEach(() => {
  database?.close();
  database = undefined;
});

async function seedPlan(db: Client, state = "collecting"): Promise<void> {
  await db.execute({
    sql: `INSERT INTO plans
            (id, organizer_id, state, date, window_start, window_end, created_at, updated_at)
          VALUES ('plan_1', 'organizer', ?, '2026-09-01', '19:00', '21:00', ?, ?)`,
    args: [state, NOW, NOW],
  });
  await db.execute({
    sql: `INSERT INTO plan_participants (id, plan_id, user_id, role, joined_at)
          VALUES ('participant_organizer', 'plan_1', 'organizer', 'organizer', ?)`,
    args: [NOW],
  });
}

async function addParticipant(db: Client, id: string, userId: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO plan_participants (id, plan_id, user_id, role, joined_at)
          VALUES (?, 'plan_1', ?, 'member', ?)`,
    args: [id, userId, NOW],
  });
}

async function insertInvite(
  db: Client,
  input: Partial<{
    id: string;
    intendedEmailHash: string | null;
    reservedUserId: string | null;
    reservationKind: "companion" | "guest";
    tokenHash: string;
    expiresAt: string;
    email: string | null;
  }> = {},
): Promise<void> {
  await insertPlanInviteIfOpen(db, {
    id: input.id ?? "invite_1",
    planId: "plan_1",
    organizerId: "organizer",
    email: input.email ?? null,
    reservationKind: input.reservationKind ?? "guest",
    reservedUserId: input.reservedUserId ?? null,
    intendedEmailHash: input.intendedEmailHash ?? "email-hash-1",
    tokenHash: input.tokenHash ?? "token-hash-1",
    expiresAt: input.expiresAt ?? LATER,
    createdAt: NOW,
  });
}

async function rollbackAndClose(tx: { rollback(): Promise<void>; close(): void }): Promise<void> {
  try {
    await tx.rollback();
  } finally {
    tx.close();
  }
}

describe("pending seat reservation primitives", () => {
  it("does not count expired reservations and enforces the three-seat capacity", async () => {
    const db = await temporaryDatabase();
    await seedPlan(db);
    await addParticipant(db, "participant_member_1", "member_1");

    await insertInvite(db, { id: "expired", tokenHash: "expired-token", expiresAt: EXPIRED });
    await expect(countPlanSeats(db, "plan_1", NOW)).resolves.toEqual({
      activeParticipants: 2,
      liveReservations: 0,
      total: 2,
    });

    await insertInvite(db, { id: "live", tokenHash: "live-token", intendedEmailHash: "email-hash-live" });
    await expect(countPlanSeats(db, "plan_1", NOW)).resolves.toEqual({
      activeParticipants: 2,
      liveReservations: 1,
      total: 3,
    });
    await expect(insertInvite(db, {
      id: "over-capacity",
      tokenHash: "over-capacity-token",
      intendedEmailHash: "email-hash-other",
    })).rejects.toMatchObject({ code: "GROUP_FULL" });
  });

  it("rejects duplicate live targets by email hash and by reserved account", async () => {
    const db = await temporaryDatabase();
    await seedPlan(db);
    await insertInvite(db, { reservedUserId: "target-user", intendedEmailHash: "target-email" });

    await expect(insertInvite(db, {
      id: "duplicate-email",
      tokenHash: "duplicate-email-token",
      intendedEmailHash: "target-email",
      reservedUserId: null,
    })).rejects.toMatchObject({ code: "INVITE_ALREADY_PENDING" });
    await expect(insertInvite(db, {
      id: "duplicate-account",
      tokenHash: "duplicate-account-token",
      intendedEmailHash: "different-email",
      reservedUserId: "target-user",
    })).rejects.toMatchObject({ code: "INVITE_ALREADY_PENDING" });
  });

  it("fails closed for wrong account, wrong hash, and unbound legacy reservations", async () => {
    const db = await temporaryDatabase();
    await seedPlan(db);
    await insertInvite(db, {
      reservedUserId: "intended-user",
      intendedEmailHash: "intended-email",
      tokenHash: "bound-token",
    });

    const wrongAccountTx = await db.transaction("write");
    await expect(claimPendingPlanInvite(wrongAccountTx, {
      planId: "plan_1",
      tokenHash: "bound-token",
      userId: "other-user",
      userEmail: "intended@example.com",
      intendedEmailHash: "intended-email",
      now: NOW,
    })).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE" });
    await rollbackAndClose(wrongAccountTx);

    const wrongHashTx = await db.transaction("write");
    await expect(claimPendingPlanInvite(wrongHashTx, {
      planId: "plan_1",
      tokenHash: "bound-token",
      userId: "intended-user",
      userEmail: "intended@example.com",
      intendedEmailHash: "wrong-email-hash",
      now: NOW,
    })).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE" });
    await rollbackAndClose(wrongHashTx);

    await db.execute({
      sql: `INSERT INTO plan_invites
              (id, plan_id, reservation_kind, email, token_hash, expires_at, created_by, created_at)
            VALUES ('legacy', 'plan_1', 'legacy', 'legacy@example.com', 'legacy-token', ?, 'organizer', ?)`,
      args: [LATER, NOW],
    });
    const legacyTx = await db.transaction("write");
    await expect(claimPendingPlanInvite(legacyTx, {
      planId: "plan_1",
      tokenHash: "legacy-token",
      userId: "legacy-user",
      userEmail: "legacy@example.com",
      intendedEmailHash: "legacy-email-hash",
      now: NOW,
    })).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE" });
    await rollbackAndClose(legacyTx);

    expect(validatePlanInvite({
      planId: "plan_1",
      intendedEmailHash: null,
      reservedUserId: null,
      expiresAt: LATER,
    }, {
      planId: "plan_1",
      userId: "legacy-user",
      userEmail: "legacy@example.com",
      intendedEmailHash: "legacy-email-hash",
      requireBound: true,
      nowMs: Date.parse(NOW),
    })).toMatchObject({ valid: false, code: "INVITE_UNAVAILABLE" });
  });

  it("preserves unbound legacy rows without counting them, while bound reservations consume seats", async () => {
    const db = await temporaryDatabase();
    await seedPlan(db);
    await db.execute({
      sql: `INSERT INTO plan_invites
              (id, plan_id, reservation_kind, email, token_hash, expires_at, created_by, created_at)
            VALUES ('legacy-seat', 'plan_1', 'legacy', 'legacy@example.com', 'legacy-seat-token', ?, 'organizer', ?)`,
      args: [LATER, NOW],
    });
    await insertInvite(db, {
      id: "bound-seat",
      tokenHash: "bound-seat-token",
      intendedEmailHash: "bound-seat-email",
    });

    await expect(countPlanSeats(db, "plan_1", NOW)).resolves.toEqual({
      activeParticipants: 1,
      liveReservations: 1,
      total: 2,
    });
    expect((await db.execute(
      "SELECT reservation_kind, intended_email_hash FROM plan_invites WHERE id = 'legacy-seat'",
    )).rows[0]).toMatchObject({ reservation_kind: "legacy", intended_email_hash: null });

    const revokeTx = await db.transaction("write");
    await revokePendingPlanInvite(revokeTx, {
      planId: "plan_1",
      organizerId: "organizer",
      inviteId: "legacy-seat",
      now: NOW,
    });
    await revokeTx.commit();
    revokeTx.close();

    await expect(countPlanSeats(db, "plan_1", NOW)).resolves.toEqual({
      activeParticipants: 1,
      liveReservations: 1,
      total: 2,
    });
  });

  it("claims once and records the accepting account in the same transaction", async () => {
    const db = await temporaryDatabase();
    await seedPlan(db);
    await insertInvite(db, {
      reservedUserId: "intended-user",
      intendedEmailHash: "intended-email",
      tokenHash: "claim-token",
    });

    const tx = await db.transaction("write");
    const claimed = await claimPendingPlanInvite(tx, {
      planId: "plan_1",
      tokenHash: "claim-token",
      userId: "intended-user",
      userEmail: "intended@example.com",
      intendedEmailHash: "intended-email",
      now: NOW,
    });
    await tx.execute({
      sql: `INSERT INTO plan_participants (id, plan_id, user_id, role, joined_at)
            VALUES ('participant_claimed', 'plan_1', 'intended-user', 'member', ?)`,
      args: [NOW],
    });
    await tx.commit();
    tx.close();

    expect(claimed).toMatchObject({
      inviteId: "invite_1",
      reservedUserId: "intended-user",
      intendedEmailHash: "intended-email",
    });
    expect((await db.execute("SELECT accepted_user_id AS userId FROM plan_invites WHERE id = 'invite_1'")).rows[0].userId)
      .toBe("intended-user");

    const retryTx = await db.transaction("write");
    await expect(claimPendingPlanInvite(retryTx, {
      planId: "plan_1",
      tokenHash: "claim-token",
      userId: "intended-user",
      userEmail: "intended@example.com",
      intendedEmailHash: "intended-email",
      now: NOW,
    })).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE" });
    await rollbackAndClose(retryTx);
    expect(Number((await db.execute("SELECT COUNT(*) AS count FROM plan_participants WHERE plan_id = 'plan_1' AND user_id = 'intended-user'")).rows[0].count))
      .toBe(1);
  });

  it("revokes a pending reservation and prevents later claim", async () => {
    const db = await temporaryDatabase();
    await seedPlan(db);
    await insertInvite(db, { tokenHash: "revoke-token" });

    const tx = await db.transaction("write");
    await revokePendingPlanInvite(tx, {
      planId: "plan_1",
      organizerId: "organizer",
      inviteId: "invite_1",
      now: NOW,
    });
    await tx.commit();
    tx.close();

    expect((await db.execute("SELECT revoked_at AS revokedAt FROM plan_invites WHERE id = 'invite_1'")).rows[0].revokedAt)
      .toBe(NOW);
    await expect(countPlanSeats(db, "plan_1", NOW)).resolves.toMatchObject({ liveReservations: 0, total: 1 });
    const claimTx = await db.transaction("write");
    await expect(claimPendingPlanInvite(claimTx, {
      planId: "plan_1",
      tokenHash: "revoke-token",
      userId: "invitee",
      userEmail: "invitee@example.com",
      intendedEmailHash: "email-hash-1",
      now: NOW,
    })).rejects.toMatchObject({ code: "INVITE_UNAVAILABLE" });
    await rollbackAndClose(claimTx);
  });

  it("rejects revocation of an expired reservation without changing its terminal fields", async () => {
    const db = await temporaryDatabase();
    await seedPlan(db);
    await insertInvite(db, { id: "expired-revoke", tokenHash: "expired-revoke-token", expiresAt: EXPIRED });

    const tx = await db.transaction("write");
    await expect(revokePendingPlanInvite(tx, {
      planId: "plan_1",
      organizerId: "organizer",
      inviteId: "expired-revoke",
      now: NOW,
    })).rejects.toMatchObject({ code: "INVITE_TERMINAL" });
    await rollbackAndClose(tx);

    expect((await db.execute("SELECT revoked_at AS revokedAt, superseded_by_invite_id AS replacement FROM plan_invites WHERE id = 'expired-revoke'")).rows[0])
      .toMatchObject({ revokedAt: null, replacement: null });
  });

  it("atomically supersedes a live reservation and creates its replacement", async () => {
    const db = await temporaryDatabase();
    await seedPlan(db);
    await insertInvite(db, { tokenHash: "old-token", intendedEmailHash: "old-email" });

    const tx = await db.transaction("write");
    const old = await supersedePendingPlanInvite(tx, {
      planId: "plan_1",
      organizerId: "organizer",
      inviteId: "invite_1",
      replacementInviteId: "invite_2",
      now: NOW,
    });
    await insertPlanInviteIfOpen(tx, {
      id: "invite_2",
      planId: "plan_1",
      organizerId: "organizer",
      reservationKind: old.reservationKind,
      reservedUserId: old.reservedUserId,
      intendedEmailHash: old.intendedEmailHash,
      tokenHash: "new-token",
      expiresAt: LATER,
      createdAt: NOW,
    });
    await tx.commit();
    tx.close();

    expect((await db.execute("SELECT revoked_at AS revokedAt, superseded_by_invite_id AS replacement FROM plan_invites WHERE id = 'invite_1'")).rows[0])
      .toMatchObject({ revokedAt: NOW, replacement: "invite_2" });
    await expect(countPlanSeats(db, "plan_1", NOW)).resolves.toEqual({
      activeParticipants: 1,
      liveReservations: 1,
      total: 2,
    });
  });

  it("rejects reissue of an expired reservation", async () => {
    const db = await temporaryDatabase();
    await seedPlan(db);
    await insertInvite(db, { id: "expired-invite", tokenHash: "expired-reissue-token", expiresAt: EXPIRED });

    const expiredTx = await db.transaction("write");
    await expect(supersedePendingPlanInvite(expiredTx, {
      planId: "plan_1",
      organizerId: "organizer",
      inviteId: "expired-invite",
      replacementInviteId: "replacement-expired",
      now: NOW,
    })).rejects.toMatchObject({ code: "INVITE_TERMINAL" });
    await rollbackAndClose(expiredTx);
  });

  it("permits only one concurrent superseder for a pending reservation", async () => {
    const db = await temporaryDatabase();
    await seedPlan(db);
    await insertInvite(db, { id: "race-invite", tokenHash: "race-token", intendedEmailHash: "race-email" });
    const attempt = async (replacementInviteId: string) => {
      let tx: Awaited<ReturnType<Client["transaction"]>> | undefined;
      try {
        tx = await db.transaction("write");
        await supersedePendingPlanInvite(tx, {
          planId: "plan_1",
          organizerId: "organizer",
          inviteId: "race-invite",
          replacementInviteId,
          now: NOW,
        });
        await tx.commit();
        return { ok: true, replacementInviteId };
      } catch (error) {
        try {
          await tx?.rollback();
        } catch {
          // A failed BEGIN may leave no usable transaction to roll back.
        }
        return { ok: false, error };
      } finally {
        tx?.close();
      }
    };
    const results = await Promise.all([attempt("replacement-a"), attempt("replacement-b")]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const raceRow = (await db.execute("SELECT revoked_at AS revokedAt, superseded_by_invite_id AS replacement FROM plan_invites WHERE id = 'race-invite'")).rows[0];
    expect(raceRow.revokedAt).toBe(NOW);
    expect(["replacement-a", "replacement-b"]).toContain(String(raceRow.replacement));
  });
});
