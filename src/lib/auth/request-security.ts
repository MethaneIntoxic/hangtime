import crypto from "node:crypto";
import type { Client } from "@libsql/client";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function safeInternalReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  try {
    const parsed = new URL(value, "https://hangtime.invalid");
    return parsed.origin === "https://hangtime.invalid"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/";
  } catch {
    return "/";
  }
}

export function isAllowedRequestOrigin(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return env.NODE_ENV !== "production";

  try {
    const expected = new URL(env.APP_URL || "http://localhost:3000").origin;
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}

export function getTrustedClientAddress(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const flyAddress = request.headers.get("fly-client-ip")?.trim();
  if (flyAddress) return flyAddress;
  if (env.VERCEL === "1") {
    return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || "unknown";
  }
  if (env.NODE_ENV !== "production") {
    return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  }
  return "unknown";
}

function rateLimitKey(scope: string, value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex");
}

export async function consumeRateLimit(
  database: Client,
  input: {
    scope: string;
    value: string;
    limit: number;
    windowSeconds: number;
    secret: string;
    nowMs?: number;
  },
): Promise<boolean> {
  const nowMs = input.nowMs ?? Date.now();
  const bucketMs = input.windowSeconds * 1_000;
  const bucketStart = new Date(Math.floor(nowMs / bucketMs) * bucketMs).toISOString();
  const keyHash = rateLimitKey(input.scope, input.value, input.secret);

  const result = await database.execute({
      sql:
        `INSERT INTO auth_rate_limits (key_hash, bucket_start, attempt_count)
         VALUES (?, ?, 1)
         ON CONFLICT(key_hash, bucket_start)
         DO UPDATE SET attempt_count = attempt_count + 1
         RETURNING attempt_count AS attemptCount`,
      args: [keyHash, bucketStart],
  });
  return Number(result.rows[0]?.attemptCount ?? 0) <= input.limit;
}
