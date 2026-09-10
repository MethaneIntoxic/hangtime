import { cookies } from "next/headers";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { consumeMagicLink } from "@/lib/auth/magic-link";
import { DEMO_SESSION_COOKIE_NAME } from "@/lib/auth/demo-session";
import { isAllowedRequestOrigin } from "@/lib/auth/request-security";
import {
  DEVELOPMENT_SESSION_COOKIE_NAME,
  PRODUCTION_SESSION_COOKIE_NAME,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/auth/production-session";
import { inviteContinuationCookieName } from "@/lib/auth/invite-continuation";

const requestSchema = z.object({ token: z.string().min(32).max(256) }).strict();

export async function POST(request: Request) {
  const noStore = <T extends Response>(response: T): T => {
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (!isAllowedRequestOrigin(request)) {
    return noStore(apiError("INVALID_ORIGIN", "The sign-in request was rejected.", 403));
  }
  if ((request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return noStore(apiError("INVALID_OR_EXPIRED_LINK", "This sign-in link is invalid or expired.", 400));
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return noStore(apiError("INVALID_OR_EXPIRED_LINK", "This sign-in link is invalid or expired.", 400));
  }

  const cookieStore = await cookies();
  const existingToken = cookieStore.get(sessionCookieName())?.value;
  const result = await consumeMagicLink(parsed.data.token, undefined, Date.now(), { previousSessionToken: existingToken });
  if (!result.ok) {
    return noStore(apiError(
      result.code,
      result.code === "LINK_ALREADY_USED"
        ? "This sign-in link has already been used."
        : "This sign-in link is invalid or expired.",
      400,
    ));
  }

  cookieStore.set(sessionCookieName(), result.session.token, sessionCookieOptions());
  cookieStore.delete(inviteContinuationCookieName());
  cookieStore.delete(DEMO_SESSION_COOKIE_NAME);
  if (sessionCookieName() === PRODUCTION_SESSION_COOKIE_NAME) {
    cookieStore.delete(DEVELOPMENT_SESSION_COOKIE_NAME);
  }

  return noStore(apiSuccess({ authenticated: true, redirectTo: result.session.pendingInviteId ? "/join/resume" : "/" }));
}
