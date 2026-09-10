import { z } from "zod";
import { cookies } from "next/headers";
import { apiError, apiSuccess } from "@/lib/api-response";
import { client } from "@/lib/db";
import { hashToken } from "@/lib/auth/crypto";
import { createInviteContinuation, inviteContinuationCookieName, inviteContinuationCookieOptions } from "@/lib/auth/invite-continuation";
import { consumeRateLimit, getTrustedClientAddress, isAllowedRequestOrigin } from "@/lib/auth/request-security";

const requestSchema = z.object({ inviteToken: z.string().trim().min(32).max(256) }).strict();

function noStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  if (!isAllowedRequestOrigin(request)) return noStore(apiError("INVALID_ORIGIN", "The request was rejected.", 403));
  if ((request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    cookieStore.delete(inviteContinuationCookieName());
    return noStore(apiError("INVALID_INPUT", "The request was rejected.", 400));
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    cookieStore.delete(inviteContinuationCookieName());
    return noStore(apiSuccess({ accepted: true }, 202));
  }
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) return noStore(apiError("AUTH_NOT_CONFIGURED", "Invitations are temporarily unavailable.", 503));

  const address = getTrustedClientAddress(request);
  const [clientAllowed, tokenAllowed] = await Promise.all([
    consumeRateLimit(client, { scope: "invite-continuation-client", value: address, limit: 20, windowSeconds: 3600, secret }),
    consumeRateLimit(client, { scope: "invite-continuation-token", value: hashToken(parsed.data.inviteToken), limit: 5, windowSeconds: 3600, secret }),
  ]);
  if (!clientAllowed || !tokenAllowed) return noStore(apiError("RATE_LIMITED", "Please try again later.", 429));

  const continuation = await createInviteContinuation(parsed.data.inviteToken);
  if (!continuation) {
    cookieStore.delete(inviteContinuationCookieName());
    return noStore(apiSuccess({ accepted: true }, 202));
  }
  cookieStore.set(inviteContinuationCookieName(), continuation.handle, inviteContinuationCookieOptions());
  return noStore(apiSuccess({ accepted: true }, 202));
}
