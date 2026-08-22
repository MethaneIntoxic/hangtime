import { PlanState } from "@/types";

export interface AvailabilityReadinessInput {
  startTime: string;
  endTime: string;
}

export interface ParticipantReadinessInput {
  userId: string;
  isReady: boolean;
  coarseOriginLabel?: string | null;
  /** The encrypted precise origin must exist server-side, but is never exposed. */
  preciseLocationAvailable?: boolean;
  availability?: readonly AvailabilityReadinessInput[];
  /** Set only after the participant has explicitly reviewed dietary state. */
  dietaryDeclared?: boolean;
}

export type ParticipantReadinessReason = "origin" | "availability" | "dietary";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function timeToMinutes(value: string): number | null {
  if (!TIME_PATTERN.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function hasValidAvailability(
  windows: readonly AvailabilityReadinessInput[] | undefined,
  planWindow?: { startTime: string; endTime: string },
): boolean {
  // Omitted availability is kept permissive for callers of the original pure
  // helper. API routes always pass the persisted/requested windows explicitly.
  if (windows === undefined) return true;
  const planStart = planWindow ? timeToMinutes(planWindow.startTime) : null;
  const planEnd = planWindow ? timeToMinutes(planWindow.endTime) : null;
  return windows.some((window) => {
    const start = timeToMinutes(window.startTime);
    const end = timeToMinutes(window.endTime);
    if (start === null || end === null || start >= end) return false;
    if (planStart === null || planEnd === null) return true;
    return start < planEnd && end > planStart;
  });
}

export interface StateTransitionResult {
  allowed: boolean;
  reason?: string;
}

const ALLOWED_TRANSITIONS: Record<PlanState, PlanState[]> = {
  draft: ["collecting", "cancelled"],
  collecting: ["recommending", "cancelled"],
  recommending: ["voting", "collecting", "cancelled"],
  voting: ["confirmed", "recommending", "cancelled"],
  confirmed: ["completed", "recommending", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionPlan(
  currentState: PlanState,
  targetState: PlanState
): StateTransitionResult {
  if (currentState === targetState) {
    return { allowed: true };
  }

  const validTargets = ALLOWED_TRANSITIONS[currentState] || [];
  if (!validTargets.includes(targetState)) {
    return {
      allowed: false,
      reason: `Cannot transition plan from '${currentState}' to '${targetState}'. Valid next states: ${validTargets.join(", ") || "none"}`,
    };
  }

  return { allowed: true };
}

export function validateParticipantReadiness(
  participants: readonly ParticipantReadinessInput[],
  planWindow?: { startTime: string; endTime: string },
): {
  allReady: boolean;
  unreadyUsers: string[];
  missingByUser: Record<string, ParticipantReadinessReason[]>;
} {
  const missingByUser: Record<string, ParticipantReadinessReason[]> = {};
  const unready = participants.filter((p) => {
    const missing: ParticipantReadinessReason[] = [];
    if (!p.coarseOriginLabel?.trim() || p.preciseLocationAvailable === false) missing.push("origin");
    if (!hasValidAvailability(p.availability, planWindow)) missing.push("availability");
    if (p.dietaryDeclared === false) missing.push("dietary");
    // A participant that has all values but has not opted in still needs the
    // explicit dietary/review action; this category is intentionally generic
    // so no private preference is disclosed to another participant.
    if (!p.isReady && missing.length === 0) missing.push("dietary");
    if (missing.length > 0) missingByUser[p.userId] = [...new Set(missing)];
    return !p.isReady || missing.length > 0;
  });
  return {
    allReady: unready.length === 0 && participants.length >= 2,
    unreadyUsers: unready.map((p) => p.userId),
    missingByUser,
  };
}
