export type InvitePreview = {
  id: string;
  mealType: string;
  date: string;
  windowStart: string;
  windowEnd: string;
  organizerDisplayName: string;
};

export function invitePreviewFromPayload(payload: unknown): InvitePreview | null {
  const plan = (payload as { data?: { plan?: unknown } } | null)?.data?.plan;
  if (!plan || typeof plan !== "object") return null;
  const candidate = plan as Record<string, unknown>;
  const fields = ["id", "mealType", "date", "windowStart", "windowEnd", "organizerDisplayName"];
  if (fields.some((field) => typeof candidate[field] !== "string" || candidate[field] === "")) return null;
  return {
    id: candidate.id as string,
    mealType: candidate.mealType as string,
    date: candidate.date as string,
    windowStart: candidate.windowStart as string,
    windowEnd: candidate.windowEnd as string,
    organizerDisplayName: candidate.organizerDisplayName as string,
  };
}

export type SafeInviteError = {
  code: string;
  title: string;
  message: string;
  action: "sign-in" | "retry" | "home";
};

export class InviteFlowError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export function safeInviteError(code: string, status: number): SafeInviteError {
  if (code === "UNAUTHORIZED" || status === 401) {
    return {
      code,
      title: "Sign in to continue",
      message: "This invitation needs sign-in. We’ll bring you back here after you sign in.",
      action: "sign-in",
    };
  }
  if (code === "INVITE_EMAIL_MISMATCH") {
    return {
      code,
      title: "This invitation isn’t available for this account",
      message: "Switch accounts or ask the organizer to reissue the invitation. No plan details were shared.",
      action: "sign-in",
    };
  }
  if (code === "INVITE_EXPIRED") {
    return { code, title: "This invitation has expired", message: "Ask the organizer to reissue the invitation link.", action: "home" };
  }
  if (code === "INVITE_REVOKED") {
    return { code, title: "This invitation was revoked", message: "Ask the organizer for a new invitation if you still want to join.", action: "home" };
  }
  if (code === "INVITE_ALREADY_USED" || code === "INVITE_SUPERSEDED" || code === "INVITE_UNAVAILABLE") {
    return { code, title: "This invitation is no longer available", message: "It has already been used or replaced. Ask the organizer for help.", action: "home" };
  }
  if (code === "GROUP_FULL") {
    return { code, title: "This plan is full", message: "The organizer needs to open another seat or start a new plan.", action: "home" };
  }
  if (code === "PLAN_UNAVAILABLE") {
    return { code, title: "This plan is no longer accepting diners", message: "Ask the organizer if there is another plan to join.", action: "home" };
  }
  if (["INVALID_INVITE", "INVITE_REQUIRED"].includes(code)) {
    return { code, title: "Invitation unavailable", message: "This invitation link is invalid or no longer available.", action: "home" };
  }
  return {
    code,
    title: "We couldn’t check this invitation",
    message: "Your invitation was not used. Check your connection and try again.",
    action: "retry",
  };
}

export function errorFromPayload(payload: { error?: { code?: string; message?: string } } | null, status: number) {
  return safeInviteError(payload?.error?.code || "UNKNOWN", status);
}

export function safeReturnTo(value: string | null): string {
  if (value === "/join/resume") return value;
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/join/")) return "/";
  return value;
}
