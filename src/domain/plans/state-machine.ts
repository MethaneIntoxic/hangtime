import { PlanState } from "@/types";

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

export function validateParticipantReadiness(participants: {
  userId: string;
  isReady: boolean;
  coarseOriginLabel?: string | null;
}[]): { allReady: boolean; unreadyUsers: string[] } {
  const unready = participants.filter(
    (p) => !p.isReady || !p.coarseOriginLabel
  );
  return {
    allReady: unready.length === 0 && participants.length >= 2,
    unreadyUsers: unready.map((p) => p.userId),
  };
}
