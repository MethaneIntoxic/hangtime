import { describe, it, expect } from "vitest";
import { canTransitionPlan, validateParticipantReadiness } from "@/domain/plans/state-machine";

describe("Plan State Machine", () => {
  it("allows valid transitions", () => {
    expect(canTransitionPlan("draft", "collecting").allowed).toBe(true);
    expect(canTransitionPlan("collecting", "recommending").allowed).toBe(true);
    expect(canTransitionPlan("recommending", "voting").allowed).toBe(true);
    expect(canTransitionPlan("voting", "confirmed").allowed).toBe(true);
    expect(canTransitionPlan("confirmed", "completed").allowed).toBe(true);
  });

  it("allows transition to cancelled from active states", () => {
    expect(canTransitionPlan("draft", "cancelled").allowed).toBe(true);
    expect(canTransitionPlan("collecting", "cancelled").allowed).toBe(true);
    expect(canTransitionPlan("voting", "cancelled").allowed).toBe(true);
    expect(canTransitionPlan("confirmed", "cancelled").allowed).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransitionPlan("draft", "confirmed").allowed).toBe(false);
    expect(canTransitionPlan("completed", "voting").allowed).toBe(false);
    expect(canTransitionPlan("cancelled", "draft").allowed).toBe(false);
  });

  it("validates participant readiness correctly", () => {
    const readyGroup = [
      { userId: "u1", isReady: true, coarseOriginLabel: "Novena" },
      { userId: "u2", isReady: true, coarseOriginLabel: "Jurong" },
    ];
    expect(validateParticipantReadiness(readyGroup).allReady).toBe(true);

    const unreadyGroup = [
      { userId: "u1", isReady: true, coarseOriginLabel: "Novena" },
      { userId: "u2", isReady: false, coarseOriginLabel: "Jurong" },
    ];
    expect(validateParticipantReadiness(unreadyGroup).allReady).toBe(false);
    expect(validateParticipantReadiness(unreadyGroup).unreadyUsers).toContain("u2");
  });
});
