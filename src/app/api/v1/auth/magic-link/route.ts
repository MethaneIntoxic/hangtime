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
  safeInternalReturnTo,
} from "@/lib/auth/request-security";
import { sendMagicLinkEmail } from "@/lib/email/auth-email";

const requestSchema = z.object({
  email: z.string().trim().email().max(254),
  returnTo: z.string().max(1_024).optional(),
}).strict();

export async function POST(request: Request) {
  if (!isAllowedRequestOrigin(request)) {
    return apiError("INVALID_ORIGIN", "The sign-in request was rejected.", 403);
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("INVALID_INPUT", "Enter a valid email address.", 400);
  }

  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    return apiError("AUTH_NOT_CONFIGURED", "Email sign-in is temporarily unavailable.", 503);
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
    return apiError("RATE_LIMITED", "Please wait before requesting another sign-in link.", 429);
  }

  await deleteExpiredAuthRecords();
  const issued = await issueMagicLink(email);
  const appUrl = new URL(process.env.APP_URL || "http://localhost:3000");
  const verificationUrl = new URL("/auth/verify", appUrl);
  // The token is carried in the URL fragment so it never reaches access logs,
  // referrers, proxies, or the verification-page request.
  verificationUrl.hash = new URLSearchParams({ token: issued.token }).toString();
  const returnTo = safeInternalReturnTo(parsed.data.returnTo);
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
    return apiError(
      "EMAIL_DELIVERY_UNAVAILABLE",
      "The sign-in email could not be sent. Please try again shortly.",
      503,
    );
  }

  return apiSuccess(
    { accepted: true, message: "If the address can receive email, a sign-in link is on its way." },
    202,
  );
}
