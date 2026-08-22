import crypto from "node:crypto";
import { DEMO_SESSION_COOKIE_NAME } from "./cookie-names";

export { DEMO_SESSION_COOKIE_NAME };
export const DEFAULT_DEMO_USER_ID = "user_maya";

const DEMO_SESSION_VERSION = 1;
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

interface DemoSessionPayload {
  v: number;
  sub: string;
  exp: number;
}

export interface DemoSessionEnvironment {
  HANGTIME_DEMO_MODE?: string;
  /** @deprecated Use HANGTIME_DEMO_MODE. Retained for local rename compatibility. */
  DINNER_TIME_DEMO_MODE?: string;
  AUTH_SECRET?: string;
  NODE_ENV?: string;
}

export function isDevelopmentDemoMode(
  env: DemoSessionEnvironment = process.env
): boolean {
  return (
    (env.HANGTIME_DEMO_MODE === "true" || env.DINNER_TIME_DEMO_MODE === "true") &&
    env.NODE_ENV !== "production"
  );
}

export function getDemoSessionSecret(
  env: DemoSessionEnvironment = process.env
): string | null {
  const secret = env.AUTH_SECRET?.trim();
  return secret ? secret : null;
}

function sign(encodedPayload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

export function createDemoSessionToken(
  userId: string,
  secret: string,
  options: { nowMs?: number; ttlSeconds?: number } = {}
): string {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId || normalizedUserId.length > 128) {
    throw new Error("A valid demo user ID is required.");
  }
  if (!secret) {
    throw new Error("AUTH_SECRET is required to sign demo sessions.");
  }

  const nowMs = options.nowMs ?? Date.now();
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Demo session TTL must be a positive integer.");
  }

  const payload: DemoSessionPayload = {
    v: DEMO_SESSION_VERSION,
    sub: normalizedUserId,
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifyDemoSessionToken(
  token: string,
  secret: string,
  nowMs = Date.now()
): string | null {
  if (!token || !secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, suppliedSignature] = parts;
  if (!encodedPayload || !suppliedSignature) return null;

  const expectedSignature = sign(encodedPayload, secret);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<DemoSessionPayload>;
    if (
      payload.v !== DEMO_SESSION_VERSION ||
      typeof payload.sub !== "string" ||
      !payload.sub ||
      typeof payload.exp !== "number" ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= Math.floor(nowMs / 1000)
    ) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}
