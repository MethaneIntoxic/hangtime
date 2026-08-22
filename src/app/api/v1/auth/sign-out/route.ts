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

export async function POST(request: Request) {
  if (!isAllowedRequestOrigin(request)) {
    return apiError("INVALID_ORIGIN", "The sign-out request was rejected.", 403);
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;
  if (token) await revokeProductionSession(token);
  cookieStore.delete(PRODUCTION_SESSION_COOKIE_NAME);
  cookieStore.delete(DEVELOPMENT_SESSION_COOKIE_NAME);
  cookieStore.delete(DEMO_SESSION_COOKIE_NAME);
  return apiSuccess({ signedOut: true });
}
