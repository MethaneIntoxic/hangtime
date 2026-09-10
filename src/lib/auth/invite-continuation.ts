import crypto from "node:crypto";
import type { Client, Transaction } from "@libsql/client";
import { client } from "@/lib/db";
import { generateId, generateToken, hashToken } from "./crypto";
import { hashIntendedEmail, normalizeEmail } from "./request-security";
import {
  DEVELOPMENT_INVITE_CONTINUATION_COOKIE_NAME,
  PRODUCTION_INVITE_CONTINUATION_COOKIE_NAME,
} from "./cookie-names";

// Keep the browser handle alive slightly beyond the 15-minute magic-link TTL.
// Verification still revalidates the invite and plan state at claim time.
export const INVITE_CONTINUATION_TTL_SECONDS = 16 * 60;
export const INVITE_CONTINUATION_COOKIE_MAX_AGE = INVITE_CONTINUATION_TTL_SECONDS;

type Executor = Pick<Client | Transaction, "execute">;

export interface CreatedInviteContinuation {
  id: string;
  handle: string;
  expiresAt: string;
}

export interface InviteContinuationRecord {
  id: string;
  inviteId: string;
  intendedEmailHash: string;
  expiresAt: string;
}

export type InviteContinuationDisposition = "none" | "bound" | "email_mismatch" | "unavailable";

function equalSecretValues(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function inviteContinuationCookieName(env: NodeJS.ProcessEnv = process.env): string {
  return env.NODE_ENV === "production"
    ? PRODUCTION_INVITE_CONTINUATION_COOKIE_NAME
    : DEVELOPMENT_INVITE_CONTINUATION_COOKIE_NAME;
}

export function inviteContinuationCookieOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    path: "/" as const,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    maxAge: INVITE_CONTINUATION_COOKIE_MAX_AGE,
  };
}

/** Internal-only classification for route cookie handling; never serialize it to clients. */
export async function getInviteContinuationDisposition(
  handle: string | null | undefined,
  intendedEmail: string,
  database: Executor = client,
  nowMs = Date.now(),
): Promise<InviteContinuationDisposition> {
  if (!handle) return "none";
  if (handle.length > 256) return "unavailable";
  const now = new Date(nowMs).toISOString();
  const result = await database.execute({
    sql: `SELECT c.intended_email_hash AS intendedEmailHash, c.expires_at AS continuationExpiresAt,
                 c.consumed_at AS consumedAt, c.revoked_at AS revokedAt,
                 i.accepted_at AS acceptedAt, i.expires_at AS inviteExpiresAt,
                 i.revoked_at AS inviteRevokedAt, i.superseded_by_invite_id AS supersededByInviteId,
                 p.state AS planState
            FROM auth_invite_continuations c
            JOIN plan_invites i ON i.id = c.invite_id
            JOIN plans p ON p.id = i.plan_id
           WHERE c.handle_hash = ?`,
    args: [hashToken(handle)],
  });
  const row = result.rows[0];
  if (!row || typeof row.intendedEmailHash !== "string" || row.consumedAt !== null || row.revokedAt !== null ||
      typeof row.continuationExpiresAt !== "string" || row.continuationExpiresAt <= now ||
      row.acceptedAt !== null || row.inviteRevokedAt !== null || row.supersededByInviteId !== null ||
      typeof row.inviteExpiresAt !== "string" || row.inviteExpiresAt <= now ||
      (row.planState !== "draft" && row.planState !== "collecting")) return "unavailable";
  return equalSecretValues(row.intendedEmailHash, hashIntendedEmail(normalizeEmail(intendedEmail)))
    ? "bound"
    : "email_mismatch";
}

/** Create a browser-bound continuation without persisting the raw handle. */
export async function createInviteContinuation(
  inviteToken: string,
  database: Executor = client,
  nowMs = Date.now(),
): Promise<CreatedInviteContinuation | null> {
  if (!inviteToken || inviteToken.length > 256) return null;
  const transactionalDatabase = database as Client & { transaction?: Client["transaction"] };
  if (!transactionalDatabase.transaction) return createInviteContinuationOnce(inviteToken, database, nowMs);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let transaction: Transaction | undefined;
    try {
      transaction = await transactionalDatabase.transaction("write");
      const result = await createInviteContinuationOnce(inviteToken, transaction, nowMs);
      await transaction.commit();
      return result;
    } catch (error) {
      if (transaction) {
        try { await transaction.rollback(); } catch { /* preserve original error */ }
      }
      if (!isTransientWriteLock(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
    } finally {
      transaction?.close();
    }
  }
  throw new Error("Invite continuation transaction retry exhausted.");
}

async function createInviteContinuationOnce(
  inviteToken: string,
  database: Executor,
  nowMs: number,
): Promise<CreatedInviteContinuation | null> {
  const now = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + INVITE_CONTINUATION_TTL_SECONDS * 1_000).toISOString();
  const invite = await database.execute({
    sql: `SELECT i.id, i.intended_email_hash AS intendedEmailHash, i.accepted_at AS acceptedAt,
                 expires_at AS inviteExpiresAt, revoked_at AS revokedAt,
                 superseded_by_invite_id AS supersededByInviteId,
                 p.state AS planState
            FROM plan_invites i JOIN plans p ON p.id = i.plan_id
           WHERE i.token_hash = ?`,
    args: [hashToken(inviteToken)],
  });
  const row = invite.rows[0];
  if (!row || typeof row.id !== "string" || typeof row.intendedEmailHash !== "string" ||
      row.acceptedAt !== null || row.revokedAt !== null || row.supersededByInviteId !== null ||
      (row.planState !== "draft" && row.planState !== "collecting") ||
      typeof row.inviteExpiresAt !== "string" || row.inviteExpiresAt <= now) {
    return null;
  }
  const inviteId = row.id;
  const intendedEmailHash = row.intendedEmailHash;

  // A new browser handoff supersedes an older unclaimed handoff for this seat.
  await database.execute({
    sql: `UPDATE auth_invite_continuations AS c SET revoked_at = ?
            WHERE c.invite_id = ? AND c.consumed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?
              AND NOT EXISTS (
                SELECT 1 FROM auth_magic_links AS ml
                 WHERE ml.continuation_id = c.id AND ml.consumed_at IS NULL AND ml.expires_at > ?
              )`,
    args: [now, inviteId, now, now],
  });
  const handle = generateToken(32);
  const id = generateId("invite_continuation");
  await database.execute({
    sql: `INSERT INTO auth_invite_continuations
            (id, handle_hash, invite_id, intended_email_hash, created_at, expires_at, consumed_at, revoked_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
    args: [id, hashToken(handle), inviteId, intendedEmailHash, now, expiresAt],
  });
  return { id, handle, expiresAt };
}

function isTransientWriteLock(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { code?: string; rawCode?: number };
  return candidate.code === "SQLITE_BUSY" || candidate.rawCode === 5 || /database is locked/i.test(error.message);
}

export async function validateInviteContinuation(
  handle: string,
  intendedEmail: string,
  database: Executor = client,
  nowMs = Date.now(),
): Promise<InviteContinuationRecord | null> {
  if (!handle || handle.length > 256) return null;
  const now = new Date(nowMs).toISOString();
  const intendedEmailHash = hashIntendedEmail(normalizeEmail(intendedEmail));
  const result = await database.execute({
    sql: `SELECT c.id, c.invite_id AS inviteId, c.intended_email_hash AS intendedEmailHash,
                 c.expires_at AS expiresAt, i.accepted_at AS acceptedAt, i.expires_at AS inviteExpiresAt,
                 i.revoked_at AS inviteRevokedAt, i.superseded_by_invite_id AS supersededByInviteId,
                 p.state AS planState
            FROM auth_invite_continuations c
            JOIN plan_invites i ON i.id = c.invite_id
            JOIN plans p ON p.id = i.plan_id
           WHERE c.handle_hash = ? AND c.consumed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?`,
    args: [hashToken(handle), now],
  });
  const row = result.rows[0];
  if (!row || typeof row.id !== "string" || typeof row.inviteId !== "string" ||
      typeof row.intendedEmailHash !== "string" || typeof row.expiresAt !== "string" ||
      row.acceptedAt !== null || row.inviteRevokedAt !== null || row.supersededByInviteId !== null ||
      (row.planState !== "draft" && row.planState !== "collecting") ||
      typeof row.inviteExpiresAt !== "string" || row.inviteExpiresAt <= now ||
      !equalSecretValues(row.intendedEmailHash, intendedEmailHash)) return null;
  return { id: row.id, inviteId: row.inviteId, intendedEmailHash: row.intendedEmailHash, expiresAt: row.expiresAt };
}

/** Claim is deliberately conditional so replayed verification cannot transfer a seat twice. */
export async function claimInviteContinuation(
  continuationId: string,
  intendedEmailHash: string,
  database: Executor = client,
  nowMs = Date.now(),
): Promise<string | null> {
  const now = new Date(nowMs).toISOString();
  const result = await database.execute({
    sql: `UPDATE auth_invite_continuations
             SET consumed_at = ?
           WHERE id = ? AND intended_email_hash = ? AND consumed_at IS NULL
             AND revoked_at IS NULL AND expires_at > ?
         RETURNING invite_id AS inviteId`,
    args: [now, continuationId, intendedEmailHash, now],
  });
  const inviteId = result.rows[0]?.inviteId;
  return typeof inviteId === "string" ? inviteId : null;
}

export async function cleanupInviteContinuations(
  database: Client,
  nowMs = Date.now(),
  retentionMs = 24 * 60 * 60 * 1_000,
): Promise<void> {
  const now = new Date(nowMs).toISOString();
  void retentionMs;
  await database.execute({
    sql: `DELETE FROM auth_invite_continuations
           WHERE expires_at < ?
             AND NOT EXISTS (
               SELECT 1 FROM auth_magic_links AS ml
                WHERE ml.continuation_id = auth_invite_continuations.id
                  AND ml.consumed_at IS NULL AND ml.expires_at > ?
             )`,
    args: [now, now],
  });
}
