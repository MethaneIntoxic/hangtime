import { cookies } from "next/headers";
import { apiError, apiSuccess } from "@/lib/api-response";
import { DEMO_SESSION_COOKIE_NAME } from "@/lib/auth/demo-session";
import { isAllowedRequestOrigin } from "@/lib/auth/request-security";
import {
  DEVELOPMENT_SESSION_COOKIE_NAME,
  PRODUCTION_SESSION_COOKIE_NAME,
  revokeProductionSession,
  sessionCookieName,
} from "@/lib/auth/production-session";
import { inviteContinuationCookieName } from "@/lib/auth/invite-continuation";

export async function POST(request: Request) {
  if (!isAllowedRequestOrigin(request)) {
    const response = apiError("INVALID_ORIGIN", "The sign-out request was rejected.", 403);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;
  if (token) await revokeProductionSession(token);
  cookieStore.delete(PRODUCTION_SESSION_COOKIE_NAME);
  cookieStore.delete(DEVELOPMENT_SESSION_COOKIE_NAME);
  cookieStore.delete(DEMO_SESSION_COOKIE_NAME);
  cookieStore.delete(inviteContinuationCookieName());
  const response = apiSuccess({ signedOut: true });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
