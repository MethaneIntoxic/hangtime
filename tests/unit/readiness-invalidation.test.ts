import { describe, expect, it } from "vitest";
import {
  hasValidAvailability,
  validateParticipantReadiness,
} from "@/domain/plans/state-machine";

describe("readiness and derived-state validity", () => {
  const planWindow = { startTime: "19:00", endTime: "21:30" };

  it("requires an origin, a valid overlapping window, and an explicit dietary declaration", () => {
    const complete = validateParticipantReadiness([
      {
        userId: "u1",
        isReady: true,
        coarseOriginLabel: "Novena / Balestier (Central)",
        preciseLocationAvailable: true,
        availability: [{ startTime: "18:30", endTime: "20:00" }],
        dietaryDeclared: true,
      },
      {
        userId: "u2",
        isReady: true,
        coarseOriginLabel: "Jurong East / Clementi (West)",
        preciseLocationAvailable: true,
        availability: [{ startTime: "20:00", endTime: "22:00" }],
        dietaryDeclared: true,
      },
    ], planWindow);
    expect(complete.allReady).toBe(true);

    const incomplete = validateParticipantReadiness([
      {
        userId: "u1",
        isReady: true,
        coarseOriginLabel: "Novena",
        preciseLocationAvailable: true,
        availability: [{ startTime: "17:00", endTime: "18:00" }],
        dietaryDeclared: false,
      },
      {
        userId: "u2",
        isReady: true,
        coarseOriginLabel: "Jurong East",
        preciseLocationAvailable: true,
        availability: [{ startTime: "19:00", endTime: "20:00" }],
        dietaryDeclared: true,
      },
    ], planWindow);
    expect(incomplete.allReady).toBe(false);
    expect(incomplete.unreadyUsers).toEqual(["u1"]);
    expect(incomplete.missingByUser.u1).toEqual(["availability", "dietary"]);
  });

  it("rejects malformed and non-overlapping availability windows", () => {
    expect(hasValidAvailability([{ startTime: "20:00", endTime: "20:00" }], planWindow)).toBe(false);
    expect(hasValidAvailability([{ startTime: "25:00", endTime: "26:00" }], planWindow)).toBe(false);
    expect(hasValidAvailability([{ startTime: "17:00", endTime: "18:00" }], planWindow)).toBe(false);
    expect(hasValidAvailability([{ startTime: "18:30", endTime: "19:15" }], planWindow)).toBe(true);
  });

  it("keeps the legacy pure helper permissive when optional evidence is omitted", () => {
    expect(validateParticipantReadiness([
      { userId: "u1", isReady: true, coarseOriginLabel: "Novena" },
      { userId: "u2", isReady: true, coarseOriginLabel: "Jurong East" },
    ]).allReady).toBe(true);
  });
});
