export function calculateMaxSelections(candidateCount: number): number {
  if (candidateCount <= 0) return 0;
  if (candidateCount === 1) return 1;
  return Math.min(candidateCount - 1, Math.floor(candidateCount / 2) + 1);
}

export interface TallyResult {
  candidateVotes: Record<string, number>;
  totalBallots: number;
  leaders: string[];
  isTie: boolean;
}

export function tallyBallots(
  candidateIds: string[],
  ballots: { userId: string; selections: string[] }[]
): TallyResult {
  const votes: Record<string, number> = {};
  for (const id of candidateIds) {
    votes[id] = 0;
  }

  for (const ballot of ballots) {
    for (const selection of ballot.selections) {
      if (votes[selection] !== undefined) {
        votes[selection] += 1;
      }
    }
  }

  let maxVotes = 0;
  let leaders: string[] = [];

  for (const [id, count] of Object.entries(votes)) {
    if (count > maxVotes) {
      maxVotes = count;
      leaders = [id];
    } else if (count === maxVotes && count > 0) {
      leaders.push(id);
    }
  }

  return {
    candidateVotes: votes,
    totalBallots: ballots.length,
    leaders,
    isTie: leaders.length > 1,
  };
}

export interface OverrideValidation {
  isOverride: boolean;
  isValid: boolean;
  error?: string;
}

export function validateDecisionOverride(
  chosenCandidateId: string,
  leaders: string[],
  overrideReason?: string | null
): OverrideValidation {
  const isLeader = leaders.includes(chosenCandidateId);

  if (isLeader) {
    return { isOverride: false, isValid: true };
  }

  const reason = (overrideReason ?? "").trim();
  if (!reason) {
    return {
      isOverride: true,
      isValid: false,
      error: "An explanation (10–240 characters) is required when choosing a non-leading option so companions understand why.",
    };
  }

  if (reason.length < 10) {
    return {
      isOverride: true,
      isValid: false,
      error: `Reason is too short (${reason.length}/10 chars minimum). Please provide a helpful explanation for companions.`,
    };
  }

  if (reason.length > 240) {
    return {
      isOverride: true,
      isValid: false,
      error: `Reason is too long (${reason.length}/240 chars maximum).`,
    };
  }

  return { isOverride: true, isValid: true };
}
