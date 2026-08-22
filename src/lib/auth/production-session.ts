import crypto from "node:crypto";
import type { Client, Transaction } from "@libsql/client";
import { client } from "@/lib/db";
import { generateId, generateToken, hashToken } from "./crypto";
import {
  DEVELOPMENT_SESSION_COOKIE_NAME,
  PRODUCTION_SESSION_COOKIE_NAME,
} from "./cookie-names";

export { DEVELOPMENT_SESSION_COOKIE_NAME, PRODUCTION_SESSION_COOKIE_NAME };
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function sessionCookieName(env: NodeJS.ProcessEnv = process.env): string {
  return env.NODE_ENV === "production"
    ? PRODUCTION_SESSION_COOKIE_NAME
    : DEVELOPMENT_SESSION_COOKIE_NAME;
}

export function sessionCookieOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    path: "/" as const,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export interface NewProductionSession {
  token: string;
  sessionId: string;
  expiresAt: string;
}

type Executor = Pick<Client | Transaction, "execute">;

export async function createProductionSession(
  userId: string,
  database: Executor = client,
  nowMs = Date.now(),
): Promise<NewProductionSession> {
  const token = generateToken(32);
  const sessionId = generateId("session");
  const now = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + SESSION_TTL_SECONDS * 1_000).toISOString();
  await database.execute({
    sql:
      `INSERT INTO auth_sessions
       (id, user_id, token_hash, expires_at, revoked_at, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    args: [sessionId, userId, hashToken(token), expiresAt, now, now],
  });
  return { token, sessionId, expiresAt };
}

export async function productionSessionUserId(
  token: string,
  database: Executor = client,
  nowMs = Date.now(),
): Promise<string | null> {
  if (!token || token.length > 256) return null;
  const now = new Date(nowMs).toISOString();
  const result = await database.execute({
    sql:
      `SELECT user_id AS userId
       FROM auth_sessions
       WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
    args: [hashToken(token), now],
  });
  const userId = result.rows[0]?.userId;
  return typeof userId === "string" ? userId : null;
}

export async function revokeProductionSession(
  token: string,
  database: Executor = client,
  nowMs = Date.now(),
): Promise<void> {
  if (!token || token.length > 256) return;
  await database.execute({
    sql:
      `UPDATE auth_sessions SET revoked_at = ?
       WHERE token_hash = ? AND revoked_at IS NULL`,
    args: [new Date(nowMs).toISOString(), hashToken(token)],
  });
}

export function timingSafeTokenMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}
