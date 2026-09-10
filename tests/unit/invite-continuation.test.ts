import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { createInviteContinuation, claimInviteContinuation, cleanupInviteContinuations, validateInviteContinuation } from "@/lib/auth/invite-continuation";
import { consumeMagicLink, issueMagicLink } from "@/lib/auth/magic-link";
import { productionSessionContext, revokeProductionSession } from "@/lib/auth/production-session";
import { hashIntendedEmail } from "@/lib/auth/request-security";
import { hashToken } from "@/lib/auth/crypto";
import { initDatabase } from "@/lib/db/init";

const secret = "test-secret-at-least-thirty-two-characters";
const nowMs = Date.UTC(2026, 7, 20, 10, 0, 0);
const temporaryDirectories: string[] = [];

async function temporaryDatabase(): Promise<Client> {
  process.env.AUTH_SECRET = secret;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hangtime-continuation-"));
  temporaryDirectories.push(directory);
  const database = createClient({ url: `file:${path.join(directory, "auth.db").replaceAll("\\", "/")}` });
  await initDatabase(database);
  return database;
}

async function insertInvite(database: Client, id: string, email: string, token = `raw-${id}`, expiresAt = new Date(nowMs + 60 * 60 * 1_000).toISOString()) {
  await database.execute({
    sql: `INSERT INTO plans (id, organizer_id, state, date, window_start, window_end, created_at, updated_at)
          VALUES ('plan_test', 'owner', 'draft', '2026-08-20', '18:00', '20:00', ?, ?)`,
    args: [new Date(nowMs).toISOString(), new Date(nowMs).toISOString()],
  });
  await database.execute({
    sql: `INSERT INTO plan_invites
      (id, plan_id, email, token_hash, expires_at, accepted_at, reservation_kind,
       reserved_user_id, intended_email_hash, revoked_at, accepted_user_id,
       superseded_by_invite_id, created_by, created_at)
      VALUES (?, 'plan_test', NULL, ?, ?, NULL, 'companion', NULL, ?, NULL, NULL, NULL, 'owner', ?)`,
    args: [id, hashToken(token), expiresAt, hashIntendedEmail(email, secret), new Date(nowMs).toISOString()],
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    void directory;
  }
});

describe("opaque invite continuations", () => {
  it("stores only a hash and rejects a wrong email", async () => {
    const database = await temporaryDatabase();
    const inviteToken = "raw-invite-hash";
    await insertInvite(database, "invite_hash", "guest@example.com", inviteToken);
    const created = await createInviteContinuation(inviteToken, database, nowMs);
    expect(created?.handle).toBeTruthy();
    const row = (await database.execute("SELECT * FROM auth_invite_continuations")).rows[0];
    expect(row).not.toHaveProperty("handle");
    expect(row.handle_hash).not.toBe(created?.handle);
    expect(await validateInviteContinuation(created!.handle, "wrong@example.com", database, nowMs)).toBeNull();
    database.close();
  });

  it("claims at most once and cleanup removes expired state", async () => {
    const database = await temporaryDatabase();
    const inviteToken = "raw-invite-claim";
    await insertInvite(database, "invite_claim", "guest@example.com", inviteToken);
    const created = await createInviteContinuation(inviteToken, database, nowMs);
    const valid = await validateInviteContinuation(created!.handle, "guest@example.com", database, nowMs);
    expect(valid?.inviteId).toBe("invite_claim");
    expect(await claimInviteContinuation(valid!.id, valid!.intendedEmailHash, database, nowMs)).toBe("invite_claim");
    expect(await claimInviteContinuation(valid!.id, valid!.intendedEmailHash, database, nowMs + 1)).toBeNull();
    await cleanupInviteContinuations(database, nowMs + 17 * 60 * 1_000);
    expect((await database.execute("SELECT COUNT(*) AS count FROM auth_invite_continuations")).rows[0].count).toBe(0);
    database.close();
  });

  it("preserves an issued link when a later browser handoff is created", async () => {
    const database = await temporaryDatabase();
    const inviteToken = "raw-invite-reissue";
    await insertInvite(database, "invite_reissue", "guest@example.com", inviteToken);
    const first = await createInviteContinuation(inviteToken, database, nowMs);
    const issued = await issueMagicLink("guest@example.com", database, nowMs, {
      continuationHandle: first!.handle,
    });
    const second = await createInviteContinuation(inviteToken, database, nowMs + 1_000);
    expect(second?.handle).toBeTruthy();
    expect(await validateInviteContinuation(first!.handle, "guest@example.com", database, nowMs + 1_000)).not.toBeNull();
    const retry = await issueMagicLink("guest@example.com", database, nowMs + 2_000, {
      continuationHandle: second!.handle,
    });
    const links = await database.execute({
      sql: "SELECT continuation_id AS continuationId FROM auth_magic_links WHERE id IN (?, ?)",
      args: [issued.id, retry.id],
    });
    expect(links.rows).toHaveLength(2);
    expect(links.rows[0].continuationId).not.toBe(links.rows[1].continuationId);
    database.close();
  });

  it("fails closed for non-joinable plans and revalidates before verification", async () => {
    const database = await temporaryDatabase();
    const inviteToken = "raw-invite-state";
    await insertInvite(database, "invite_state", "guest@example.com", inviteToken);
    await database.execute({ sql: "UPDATE plans SET state = 'confirmed' WHERE id = 'plan_test'" });
    expect(await createInviteContinuation(inviteToken, database, nowMs)).toBeNull();

    await database.execute({ sql: "UPDATE plans SET state = 'draft' WHERE id = 'plan_test'" });
    const continuation = await createInviteContinuation(inviteToken, database, nowMs);
    const link = await issueMagicLink("guest@example.com", database, nowMs, {
      continuationHandle: continuation!.handle,
    });
    await database.execute({ sql: "UPDATE plans SET state = 'confirmed' WHERE id = 'plan_test'" });
    const result = await consumeMagicLink(link.token, database, nowMs + 1_000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.pendingInviteId).toBeNull();
    database.close();
  });

  it("keeps a bound continuation usable near the magic-link expiry boundary", async () => {
    const database = await temporaryDatabase();
    const inviteToken = "raw-invite-boundary";
    await insertInvite(database, "invite_boundary", "guest@example.com", inviteToken);
    const continuation = await createInviteContinuation(inviteToken, database, nowMs);
    const link = await issueMagicLink("guest@example.com", database, nowMs, {
      continuationHandle: continuation!.handle,
    });
    const result = await consumeMagicLink(link.token, database, nowMs + 15 * 60 * 1_000 - 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.pendingInviteId).toBe("invite_boundary");
    database.close();
  });

  it("extends a late-issued link and preserves wrong-email retry", async () => {
    const database = await temporaryDatabase();
    const inviteToken = "raw-invite-late";
    await insertInvite(database, "invite_late", "guest@example.com", inviteToken);
    const continuation = await createInviteContinuation(inviteToken, database, nowMs);
    const wrong = await issueMagicLink("other@example.com", database, nowMs + 15 * 60 * 1_000);
    expect(wrong.continuationDisposition).toBe("none");
    const wrongWithHandle = await issueMagicLink("other@example.com", database, nowMs + 15 * 60 * 1_000, {
      continuationHandle: continuation!.handle,
    });
    expect(wrongWithHandle.continuationDisposition).toBe("email_mismatch");
    expect(wrongWithHandle.continuationId).toBeNull();
    const intended = await issueMagicLink("guest@example.com", database, nowMs + 15 * 60 * 1_000, {
      continuationHandle: continuation!.handle,
    });
    expect(intended.continuationDisposition).toBe("bound");
    const result = await consumeMagicLink(intended.token, database, nowMs + 30 * 60 * 1_000 - 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.pendingInviteId).toBe("invite_late");
    database.close();
  });

  it("serializes concurrent handoffs and clears the session invite pointer on revoke", async () => {
    const database = await temporaryDatabase();
    const inviteToken = "raw-invite-race";
    await insertInvite(database, "invite_race", "guest@example.com", inviteToken);
    const continuations = await Promise.all(
      Array.from({ length: 4 }, () => createInviteContinuation(inviteToken, database, nowMs)),
    );
    expect(continuations.every(Boolean)).toBe(true);
    const active = await database.execute({
      sql: `SELECT COUNT(*) AS count FROM auth_invite_continuations
             WHERE invite_id = ? AND consumed_at IS NULL AND revoked_at IS NULL`,
      args: ["invite_race"],
    });
    expect(Number(active.rows[0].count)).toBe(1);

    const link = await issueMagicLink("guest@example.com", database, nowMs);
    const session = (await consumeMagicLink(link.token, database, nowMs + 1_000));
    expect(session.ok).toBe(true);
    if (session.ok) {
      await database.execute({
        sql: "UPDATE auth_sessions SET pending_invite_id = ? WHERE id = ?",
        args: ["invite_race", session.session.sessionId],
      });
      await revokeProductionSession(session.session.token, database, nowMs + 2_000);
      expect(await productionSessionContext(session.session.token, database, nowMs + 2_001)).toBeNull();
      const pointer = await database.execute({
        sql: "SELECT pending_invite_id AS pendingInviteId FROM auth_sessions WHERE id = ?",
        args: [session.session.sessionId],
      });
      expect(pointer.rows[0].pendingInviteId).toBeNull();
    }
    database.close();
  });

  it("binds verification to the rotated session and revokes the old session", async () => {
    const database = await temporaryDatabase();
    const oldLink = await issueMagicLink("owner@example.com", database, nowMs);
    const oldResult = await consumeMagicLink(oldLink.token, database, nowMs + 1_000);
    expect(oldResult.ok).toBe(true);
    if (!oldResult.ok) return;
    const inviteToken = "raw-invite-session";
    await insertInvite(database, "invite_session", "guest@example.com", inviteToken);
    const continuation = await createInviteContinuation(inviteToken, database, nowMs);
    const link = await issueMagicLink("guest@example.com", database, nowMs, { continuationHandle: continuation!.handle });
    const result = await consumeMagicLink(link.token, database, nowMs + 2_000, { previousSessionToken: oldResult.session.token });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.pendingInviteId).toBe("invite_session");
    expect(await productionSessionContext(oldResult.session.token, database, nowMs + 3_000)).toBeNull();
    expect((await database.execute({
      sql: "SELECT continuation_id AS continuationId FROM auth_magic_links WHERE id = ?",
      args: [link.id],
    })).rows[0].continuationId).toBeTruthy();
    database.close();
  });
});
