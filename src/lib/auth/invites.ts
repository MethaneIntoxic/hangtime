export interface PlanInviteForValidation {
  planId: string;
  email?: string | null;
  expiresAt: string;
  acceptedAt?: string | null;
}

export type InviteValidationResult =
  | { valid: true }
  | {
      valid: false;
      code:
        | "INVALID_INVITE"
        | "INVITE_EXPIRED"
        | "INVITE_ALREADY_USED"
        | "INVITE_EMAIL_MISMATCH";
      message: string;
    };

export function validatePlanInvite(
  invite: PlanInviteForValidation | null | undefined,
  context: { planId: string; userEmail: string; nowMs?: number }
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

  const queryToken = new URL(request.url).searchParams.get("inviteToken")?.trim();
  return queryToken || null;
}
