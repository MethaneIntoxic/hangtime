import { cookies } from "next/headers";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { consumeMagicLink } from "@/lib/auth/magic-link";
import { DEMO_SESSION_COOKIE_NAME } from "@/lib/auth/demo-session";
import { isAllowedRequestOrigin } from "@/lib/auth/request-security";
import {
  DEVELOPMENT_SESSION_COOKIE_NAME,
  PRODUCTION_SESSION_COOKIE_NAME,
  revokeProductionSession,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/auth/production-session";

const requestSchema = z.object({ token: z.string().min(32).max(256) }).strict();

export async function POST(request: Request) {
  if (!isAllowedRequestOrigin(request)) {
    return apiError("INVALID_ORIGIN", "The sign-in request was rejected.", 403);
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("INVALID_OR_EXPIRED_LINK", "This sign-in link is invalid or expired.", 400);
  }

  const cookieStore = await cookies();
  const existingToken = cookieStore.get(sessionCookieName())?.value;
  const result = await consumeMagicLink(parsed.data.token);
  if (!result.ok) {
    return apiError(
      result.code,
      result.code === "LINK_ALREADY_USED"
        ? "This sign-in link has already been used."
        : "This sign-in link is invalid or expired.",
      400,
    );
  }

  if (existingToken) await revokeProductionSession(existingToken);
  cookieStore.set(sessionCookieName(), result.session.token, sessionCookieOptions());
  cookieStore.delete(DEMO_SESSION_COOKIE_NAME);
  if (sessionCookieName() === PRODUCTION_SESSION_COOKIE_NAME) {
    cookieStore.delete(DEVELOPMENT_SESSION_COOKIE_NAME);
  }

  return apiSuccess({ authenticated: true });
}
