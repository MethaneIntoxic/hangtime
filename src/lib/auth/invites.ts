import crypto from "node:crypto";

export interface PlanInviteForValidation {
  planId: string;
  email?: string | null;
  intendedEmailHash?: string | null;
  reservedUserId?: string | null;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  supersededByInviteId?: string | null;
}

export type InviteValidationResult =
  | { valid: true }
  | {
      valid: false;
      code:
        | "INVALID_INVITE"
        | "INVITE_EXPIRED"
        | "INVITE_ALREADY_USED"
        | "INVITE_EMAIL_MISMATCH"
        | "INVITE_UNAVAILABLE";
      message: string;
    };

export function validatePlanInvite(
  invite: PlanInviteForValidation | null | undefined,
  context: {
    planId: string;
    userEmail: string;
    userId?: string;
    intendedEmailHash?: string;
    requireBound?: boolean;
    nowMs?: number;
  }
): InviteValidationResult {
  if (!invite || invite.planId !== context.planId) {
    return {
      valid: false,
      code: "INVALID_INVITE",
      message: "A valid invitation is required to join this plan.",
    };
  }
  if (invite.acceptedAt) {
    return {
      valid: false,
      code: "INVITE_ALREADY_USED",
      message: "This invitation has already been used.",
    };
  }

  if (invite.revokedAt || invite.supersededByInviteId) {
    return {
      valid: false,
      code: "INVITE_UNAVAILABLE",
      message: "This invitation is no longer available.",
    };
  }

  if (context.requireBound && !invite.intendedEmailHash) {
    return {
      valid: false,
      code: "INVITE_UNAVAILABLE",
      message: "This invitation is no longer available.",
    };
  }
  if (invite.reservedUserId && invite.reservedUserId !== context.userId) {
    return {
      valid: false,
      code: "INVITE_UNAVAILABLE",
      message: "This invitation is no longer available.",
    };
  }
  if (invite.intendedEmailHash) {
    if (!context.intendedEmailHash) {
      return {
        valid: false,
        code: "INVITE_UNAVAILABLE",
        message: "This invitation is no longer available.",
      };
    }
    const expected = Buffer.from(invite.intendedEmailHash, "utf8");
    const actual = Buffer.from(context.intendedEmailHash, "utf8");
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return {
        valid: false,
        code: "INVITE_UNAVAILABLE",
        message: "This invitation is no longer available.",
      };
    }
  }

  const expiresAtMs = Date.parse(invite.expiresAt);
  const nowMs = context.nowMs ?? Date.now();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    return {
      valid: false,
      code: "INVITE_EXPIRED",
      message: "This invitation has expired.",
    };
  }

  if (
    invite.email &&
    invite.email.trim().toLowerCase() !== context.userEmail.trim().toLowerCase()
  ) {
    return {
      valid: false,
      code: "INVITE_EMAIL_MISMATCH",
      message: "This invitation was issued to a different email address.",
    };
  }

  return { valid: true };
}

export function extractInviteToken(
  request: Request,
  bodyToken?: unknown
): string | null {
  if (typeof bodyToken === "string" && bodyToken.trim()) {
    return bodyToken.trim();
  }
  const headerToken = request.headers.get("x-plan-invite-token")?.trim();
  if (headerToken) return headerToken;

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Invite ")) {
    const token = authorization.slice("Invite ".length).trim();
    if (token) return token;
  }

  // Never accept invite secrets from query strings: URLs leak through browser
  // history, referrers, proxy logs, and copied diagnostics. The join page
  // submits the token in the JSON body; trusted server callers may use one of
  // the explicit headers above.
  return null;
}
