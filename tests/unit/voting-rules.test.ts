import { describe, it, expect } from "vitest";
import {
  calculateMaxSelections,
  tallyBallots,
  validateDecisionOverride,
} from "@/domain/voting/rules";

describe("Voting Rules & Constraints", () => {
  it("computes maxSelections correctly according to formula min(n - 1, floor(n / 2) + 1)", () => {
    expect(calculateMaxSelections(0)).toBe(0);
    // For n = 1 -> 1
    expect(calculateMaxSelections(1)).toBe(1);
    // For n = 2 -> min(1, 1+1) = 1
    expect(calculateMaxSelections(2)).toBe(1);
    // For n = 3 -> min(2, 1+1) = 2
    expect(calculateMaxSelections(3)).toBe(2);
    // For n = 4 -> min(3, 2+1) = 3
    expect(calculateMaxSelections(4)).toBe(3);
    // For n = 5 -> min(4, 2+1) = 3
    expect(calculateMaxSelections(5)).toBe(3);
    // For n = 6 -> min(5, 3+1) = 4
    expect(calculateMaxSelections(6)).toBe(4);
    expect(calculateMaxSelections(7)).toBe(4);
    // For n = 8 -> min(7, 4+1) = 5
    expect(calculateMaxSelections(8)).toBe(5);
  });

  it("does not invent a leader when no votes have been cast", () => {
    expect(tallyBallots(["c1", "c2"], [])).toEqual({
      candidateVotes: { c1: 0, c2: 0 },
      totalBallots: 0,
      leaders: [],
      isTie: false,
    });
  });

  it("tallies ballots and determines clear leader", () => {
    const candidateIds = ["c1", "c2", "c3", "c4"];
    const ballots = [
      { userId: "u1", selections: ["c1", "c2"] },
      { userId: "u2", selections: ["c1", "c3"] },
    ];

    const result = tallyBallots(candidateIds, ballots);
    expect(result.candidateVotes["c1"]).toBe(2);
    expect(result.candidateVotes["c2"]).toBe(1);
    expect(result.candidateVotes["c3"]).toBe(1);
    expect(result.candidateVotes["c4"]).toBe(0);
    expect(result.leaders).toEqual(["c1"]);
    expect(result.isTie).toBe(false);
  });

  it("detects tied leaders when votes are equal", () => {
    const candidateIds = ["c1", "c2", "c3"];
    const ballots = [
      { userId: "u1", selections: ["c1"] },
      { userId: "u2", selections: ["c2"] },
    ];

    const result = tallyBallots(candidateIds, ballots);
    expect(result.leaders).toEqual(["c1", "c2"]);
    expect(result.isTie).toBe(true);
  });

  it("validates override reasons for non-leading candidate selections", () => {
    const leaders = ["c1"];

    // Selecting leader does not require override reason
    const validLeader = validateDecisionOverride("c1", leaders);
    expect(validLeader.isOverride).toBe(false);
    expect(validLeader.isValid).toBe(true);

    // Selecting non-leader without reason fails
    const invalidNoReason = validateDecisionOverride("c2", leaders, "");
    expect(invalidNoReason.isOverride).toBe(true);
    expect(invalidNoReason.isValid).toBe(false);

    // Selecting non-leader with short reason (<10 chars) fails
    const invalidShortReason = validateDecisionOverride("c2", leaders, "Too busy");
    expect(invalidShortReason.isOverride).toBe(true);
    expect(invalidShortReason.isValid).toBe(false);

    // Selecting non-leader with valid explanation (10-240 chars) succeeds
    const validOverride = validateDecisionOverride(
      "c2",
      leaders,
      "Dumpling Darlings is fully booked, so going with Tipo Pasta Bar instead."
    );
    expect(validOverride.isOverride).toBe(true);
    expect(validOverride.isValid).toBe(true);

    expect(validateDecisionOverride("c2", leaders, "1234567890").isValid).toBe(true);
    expect(validateDecisionOverride("c2", leaders, "x".repeat(240)).isValid).toBe(true);
    expect(validateDecisionOverride("c2", leaders, "x".repeat(241)).isValid).toBe(false);
  });
});
