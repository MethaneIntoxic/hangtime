import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { client } from "@/lib/db";
import {
  deleteExpiredAuthRecords,
  issueMagicLink,
  updateMagicLinkDelivery,
} from "@/lib/auth/magic-link";
import {
  consumeRateLimit,
  getTrustedClientAddress,
  isAllowedRequestOrigin,
  normalizeEmail,
} from "@/lib/auth/request-security";
import { sendMagicLinkEmail } from "@/lib/email/auth-email";
import { cookies } from "next/headers";
import {
  inviteContinuationCookieName,
} from "@/lib/auth/invite-continuation";

const requestSchema = z.object({
  email: z.string().trim().email().max(254),
  returnTo: z.string().max(1_024).optional(),
}).strict();

function safeMagicReturnTo(value: unknown): string {
  return value === "/join/resume" ? value : "/";
}

export async function POST(request: Request) {
  const noStore = <T extends Response>(response: T): T => {
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (!isAllowedRequestOrigin(request)) {
    return noStore(apiError("INVALID_ORIGIN", "The sign-in request was rejected.", 403));
  }
  if ((request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return noStore(apiError("INVALID_INPUT", "Enter a valid email address.", 400));
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return noStore(apiError("INVALID_INPUT", "Enter a valid email address.", 400));
  }

  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    return noStore(apiError("AUTH_NOT_CONFIGURED", "Email sign-in is temporarily unavailable.", 503));
  }

  const email = normalizeEmail(parsed.data.email);
  const clientAddress = getTrustedClientAddress(request);
  const emailAllowed = await consumeRateLimit(client, {
    scope: "auth-email",
    value: email,
    limit: 3,
    windowSeconds: 60 * 60,
    secret,
  });
  const clientAllowed = await consumeRateLimit(client, {
    scope: "auth-client",
    value: clientAddress,
    limit: 10,
    windowSeconds: 60 * 60,
    secret,
  });
  if (!emailAllowed || !clientAllowed) {
    return noStore(apiError("RATE_LIMITED", "Please wait before requesting another sign-in link.", 429));
  }

  await deleteExpiredAuthRecords();
  const cookieStore = await cookies();
  const continuationHandle = cookieStore.get(inviteContinuationCookieName())?.value ?? null;
  const issued = await issueMagicLink(email, client, Date.now(), { continuationHandle });
  const isBound = issued.continuationDisposition === "bound" && Boolean(issued.continuationId);
  if (issued.continuationDisposition === "unavailable") cookieStore.delete(inviteContinuationCookieName());
  const appUrl = new URL(process.env.APP_URL || "http://localhost:3000");
  const verificationUrl = new URL("/auth/verify", appUrl);
  // The token is carried in the URL fragment so it never reaches access logs,
  // referrers, proxies, or the verification-page request.
  verificationUrl.hash = new URLSearchParams({ token: issued.token }).toString();
  const returnTo = isBound ? "/join/resume" : safeMagicReturnTo(parsed.data.returnTo);
  if (returnTo !== "/") verificationUrl.searchParams.set("next", returnTo);

  try {
    const delivery = await sendMagicLinkEmail({
      email,
      magicLinkUrl: verificationUrl.toString(),
      expiresAt: issued.expiresAt,
    });
    await updateMagicLinkDelivery(issued.id, "sent", delivery.providerMessageId);
  } catch {
    await updateMagicLinkDelivery(issued.id, "failed", null);
    return noStore(apiError(
      "EMAIL_DELIVERY_UNAVAILABLE",
      "The sign-in email could not be sent. Please try again shortly.",
      503,
    ));
  }

  if (isBound) cookieStore.delete(inviteContinuationCookieName());

  return noStore(apiSuccess(
    { accepted: true, message: "If the address can receive email, a sign-in link is on its way." },
    202,
  ));
}
