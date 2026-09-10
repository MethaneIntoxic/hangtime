import type { Client, Transaction } from "@libsql/client";
import { client } from "@/lib/db";
import { generateId, generateToken, hashToken } from "./crypto";
import { hashIntendedEmail, normalizeEmail } from "./request-security";
import {
  claimInviteContinuation,
  getInviteContinuationDisposition,
  validateInviteContinuation,
  type InviteContinuationDisposition,
} from "./invite-continuation";
import {
  createProductionSession,
  revokeProductionSession,
  type NewProductionSession,
} from "./production-session";

export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

export interface IssuedMagicLink {
  id: string;
  email: string;
  token: string;
  expiresAt: string;
  continuationId: string | null;
  continuationDisposition: InviteContinuationDisposition;
}

export interface IssueMagicLinkOptions {
  continuationHandle?: string | null;
}

export interface ConsumeMagicLinkOptions {
  previousSessionToken?: string | null;
}

export type ConsumeMagicLinkResult =
  | { ok: true; userId: string; session: NewProductionSession }
  | { ok: false; code: "INVALID_OR_EXPIRED_LINK" | "LINK_ALREADY_USED" };

type Executor = Pick<Client | Transaction, "execute">;

export async function issueMagicLink(
  email: string,
  database: Executor = client,
  nowMs = Date.now(),
  options: IssueMagicLinkOptions = {},
): Promise<IssuedMagicLink> {
  const normalized = normalizeEmail(email);
  const continuationDisposition = await getInviteContinuationDisposition(
    options.continuationHandle,
    normalized,
    database,
    nowMs,
  );
  const validatedContinuation = options.continuationHandle
    ? await validateInviteContinuation(options.continuationHandle, normalized, database, nowMs)
    : null;
  const token = generateToken(32);
  const id = generateId("authlink");
  const now = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + MAGIC_LINK_TTL_SECONDS * 1_000).toISOString();

  await database.execute({
    sql:
      `INSERT INTO auth_magic_links
       (id, email_normalized, token_hash, expires_at, consumed_at,
        delivery_status, provider_message_id, continuation_id, created_at)
       VALUES (?, ?, ?, ?, NULL, 'pending', NULL, ?, ?)`,
    args: [id, normalized, hashToken(token), expiresAt, validatedContinuation?.id ?? null, now],
  });
  let continuationId = validatedContinuation?.id ?? null;
  let finalDisposition = continuationDisposition;
  if (continuationId) {
    const extended = await database.execute({
      sql: `UPDATE auth_invite_continuations
               SET expires_at = CASE WHEN expires_at < ? THEN ? ELSE expires_at END
             WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?
           RETURNING id`,
      args: [expiresAt, expiresAt, continuationId, new Date(nowMs).toISOString()],
    });
    if (extended.rows.length !== 1) {
      // Do not leave a magic-link row pointing at a continuation that failed
      // the live binding/extension check.
      await database.execute({
        sql: "UPDATE auth_magic_links SET continuation_id = NULL WHERE id = ?",
        args: [id],
      });
      continuationId = null;
      finalDisposition = "unavailable";
    }
  }
  return { id, email: normalized, token, expiresAt, continuationId, continuationDisposition: finalDisposition };
}

export async function updateMagicLinkDelivery(
  id: string,
  status: "sent" | "failed",
  providerMessageId: string | null,
  database: Executor = client,
): Promise<void> {
  await database.execute({
    sql:
      `UPDATE auth_magic_links
       SET delivery_status = ?, provider_message_id = ? WHERE id = ?`,
    args: [status, providerMessageId, id],
  });
}

function displayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] || "Friend";
  const words = localPart.replace(/[._+-]+/g, " ").trim();
  return words
    ? words.replace(/\b\w/g, (character) => character.toUpperCase()).slice(0, 80)
    : "Friend";
}

async function consumeMagicLinkOnce(
  token: string,
  database: Client = client,
  nowMs = Date.now(),
  options: ConsumeMagicLinkOptions = {},
): Promise<ConsumeMagicLinkResult> {
  if (!token || token.length > 256) {
    return { ok: false, code: "INVALID_OR_EXPIRED_LINK" };
  }
  const tokenHash = hashToken(token);
  const now = new Date(nowMs).toISOString();

  const transaction = await database.transaction("write");
  try {
    const result = await transaction.execute({
      sql:
        `SELECT email_normalized AS email, expires_at AS expiresAt,
                consumed_at AS consumedAt, continuation_id AS continuationId
         FROM auth_magic_links WHERE token_hash = ?`,
      args: [tokenHash],
    });
    const row = result.rows[0];
    const link = row
      ? {
          email: String(row.email),
          expiresAt: String(row.expiresAt),
          consumedAt: row.consumedAt === null ? null : String(row.consumedAt),
          continuationId: typeof row.continuationId === "string" ? row.continuationId : null,
        }
      : undefined;

    if (!link || link.expiresAt <= now) {
      await transaction.rollback();
      return { ok: false, code: "INVALID_OR_EXPIRED_LINK" };
    }
    if (link.consumedAt) {
      await transaction.rollback();
      return { ok: false, code: "LINK_ALREADY_USED" };
    }

    const consumed = await transaction.execute({
      sql:
        `UPDATE auth_magic_links SET consumed_at = ?
         WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
      args: [now, tokenHash, now],
    });
    if (consumed.rowsAffected !== 1) {
      await transaction.rollback();
      return { ok: false, code: "LINK_ALREADY_USED" };
    }

    const profileResult = await transaction.execute({
      sql: `SELECT id FROM profiles WHERE lower(trim(email)) = ?`,
      args: [link.email],
    });
    const existingProfileId = profileResult.rows[0]?.id;
    let profile = typeof existingProfileId === "string" ? { id: existingProfileId } : undefined;
    if (!profile) {
      profile = { id: generateId("user") };
      await transaction.execute({
        sql:
          `INSERT INTO profiles
           (id, email, display_name, avatar_path, account_kind, timezone,
            coarse_area, notification_prefs, created_at, updated_at)
           VALUES (?, ?, ?, NULL, 'full', 'Asia/Singapore', NULL,
                   '{"email":true,"push":false}', ?, ?)`,
        args: [
          profile.id,
          link.email,
          displayNameFromEmail(link.email),
          now,
          now,
        ],
      });
    }

    let pendingInviteId: string | null = null;
    if (link.continuationId) {
      const continuationResult = await transaction.execute({
        sql: `SELECT c.id, c.invite_id AS inviteId, c.intended_email_hash AS intendedEmailHash,
                     c.expires_at AS continuationExpiresAt, c.consumed_at AS continuationConsumedAt,
                     c.revoked_at AS continuationRevokedAt,
                     i.expires_at AS inviteExpiresAt, i.accepted_at AS acceptedAt,
                     i.revoked_at AS inviteRevokedAt, i.superseded_by_invite_id AS supersededByInviteId,
                     i.reserved_user_id AS reservedUserId,
                     i.intended_email_hash AS inviteEmailHash,
                     p.state AS planState
                FROM auth_invite_continuations c
                JOIN plan_invites i ON i.id = c.invite_id
                JOIN plans p ON p.id = i.plan_id
               WHERE c.id = ?`,
        args: [link.continuationId],
      });
      const continuationRow = continuationResult.rows[0];
      const expectedEmailHash = hashIntendedEmail(link.email);
      const live = continuationRow &&
        typeof continuationRow.intendedEmailHash === "string" &&
        continuationRow.intendedEmailHash === expectedEmailHash &&
        continuationRow.inviteEmailHash === expectedEmailHash &&
        continuationRow.continuationConsumedAt === null &&
        continuationRow.continuationRevokedAt === null &&
        typeof continuationRow.continuationExpiresAt === "string" && continuationRow.continuationExpiresAt > now &&
        continuationRow.acceptedAt === null && continuationRow.inviteRevokedAt === null &&
        continuationRow.supersededByInviteId === null &&
        (continuationRow.planState === "draft" || continuationRow.planState === "collecting") &&
        typeof continuationRow.inviteExpiresAt === "string" && continuationRow.inviteExpiresAt > now &&
        (continuationRow.reservedUserId === null || continuationRow.reservedUserId === profile.id);
      if (live) {
        pendingInviteId = await claimInviteContinuation(
          link.continuationId,
          expectedEmailHash,
          transaction,
          nowMs,
        );
      }
    }

    if (options.previousSessionToken) {
      await revokeProductionSession(options.previousSessionToken, transaction, nowMs);
    }
    const session = await createProductionSession(profile.id, transaction, nowMs, { pendingInviteId });
    await transaction.commit();
    return { ok: true, userId: profile.id, session };
  } finally {
    transaction.close();
  }
}

function isTransientWriteLock(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { code?: string; rawCode?: number };
  return candidate.code === "SQLITE_BUSY" || candidate.rawCode === 5 || /database is locked/i.test(error.message);
}

export async function consumeMagicLink(
  token: string,
  database: Client = client,
  nowMs = Date.now(),
  options: ConsumeMagicLinkOptions = {},
): Promise<ConsumeMagicLinkResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await consumeMagicLinkOnce(token, database, nowMs, options);
    } catch (error) {
      if (!isTransientWriteLock(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
  throw new Error("Magic-link transaction retry exhausted.");
}

export async function deleteExpiredAuthRecords(
  database: Client = client,
  nowMs = Date.now(),
): Promise<void> {
  const now = new Date(nowMs).toISOString();
  const rateLimitCutoff = new Date(nowMs - 48 * 60 * 60 * 1_000).toISOString();
  await database.batch([
    { sql: `DELETE FROM auth_magic_links WHERE expires_at < ?`, args: [now] },
    { sql: `DELETE FROM auth_sessions WHERE expires_at < ? OR revoked_at IS NOT NULL`, args: [now] },
    { sql: `DELETE FROM auth_rate_limits WHERE bucket_start < ?`, args: [rateLimitCutoff] },
    { sql: `DELETE FROM auth_invite_continuations WHERE expires_at < ?`, args: [now] },
  ], "write");
}
