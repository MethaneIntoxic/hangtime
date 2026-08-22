import { describe, it, expect } from "vitest";
import { generateRecommendations } from "@/domain/recommendations/scorer";
import { estimateSingaporeTransit } from "@/providers/singapore-transit";

describe("Transit Routing & Recommendation Engine", () => {
  it("estimates realistic Singapore public transit durations and MRT lines", () => {
    // Jurong East (West) to Telok Ayer (CBD)
    const jurongToCBD = estimateSingaporeTransit(1.3329, 103.7436, 1.2808, 103.8475, "Jurong East");
    expect(jurongToCBD.durationMinutes).toBeGreaterThan(15);
    expect(jurongToCBD.durationMinutes).toBeLessThan(45);
    expect(jurongToCBD.mrtLines).toContain("EWL");

    // Tampines (East) to Telok Ayer (CBD)
    const tampinesToCBD = estimateSingaporeTransit(1.3533, 103.9452, 1.2808, 103.8475, "Tampines");
    expect(tampinesToCBD.durationMinutes).toBeGreaterThan(15);
    expect(tampinesToCBD.durationMinutes).toBeLessThan(45);
  });

  it("generates explainable diverse shortlist for group of diners", () => {
    const candidates = generateRecommendations({
      runId: "run_test_01",
      planId: "plan_test_01",
      participants: [
        {
          participantId: "p1",
          userId: "u_maya",
          displayName: "Maya",
          coarseOriginLabel: "Novena",
          lat: 1.3204,
          lng: 103.8436,
          dietaryRules: [],
          cuisinePreferences: [{ id: "1", userId: "u_maya", cuisineCode: "japanese", weight: 2 }],
        },
        {
          participantId: "p2",
          userId: "u_ethan",
          displayName: "Ethan",
          coarseOriginLabel: "Jurong East",
          lat: 1.3329,
          lng: 103.7436,
          dietaryRules: [],
          cuisinePreferences: [{ id: "2", userId: "u_ethan", cuisineCode: "japanese", weight: 2 }],
        },
      ],
      mealType: "dinner",
      groupBudgetCents: 14000,
      alcoholMode: "excluded",
      fairnessMode: "equal_journeys",
      shortlistSize: 5,
    });

    expect(candidates.length).toBeGreaterThanOrEqual(3);
    expect(candidates.length).toBeLessThanOrEqual(5);

    for (const c of candidates) {
      expect(c.transitEstimates).toHaveLength(2);
      expect(c.badges.length).toBeGreaterThan(0);
      expect(c.whyRecommended).toBeTruthy();
      expect(c.priceRangeMinCents).toBeGreaterThan(0);
      expect(c.priceRangeMaxCents).toBeGreaterThan(c.priceRangeMinCents);
    }
  });

  it("keeps private origins out of recommendation DTOs while exposing coarse evidence", () => {
    const candidates = generateRecommendations({
      runId: "run_privacy_canary",
      planId: "plan_privacy_canary",
      participants: [
        {
          participantId: "participant_maya",
          userId: "user_maya",
          displayName: "Maya",
          coarseOriginLabel: "Novena / Balestier (Central)",
          lat: 1.401234,
          lng: 103.701234,
          dietaryRules: [{ id: "rule-1", userId: "user_maya", ruleCode: "nut_allergy", severity: "allergy", createdAt: "" }],
          cuisinePreferences: [],
        },
        {
          participantId: "participant_ethan",
          userId: "user_ethan",
          displayName: "Ethan",
          coarseOriginLabel: "Jurong East / Clementi (West)",
          lat: 1.412345,
          lng: 103.712345,
          dietaryRules: [],
          cuisinePreferences: [],
        },
      ],
      mealType: "dinner",
      groupBudgetCents: 14_000,
      alcoholMode: "excluded",
      fairnessMode: "equal_journeys",
      shortlistSize: 5,
    });

    expect(candidates.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(candidates);
    expect(serialized).not.toContain("401234");
    expect(serialized).not.toContain("701234");
    expect(serialized).not.toContain("307683");
    for (const candidate of candidates) {
      expect(candidate.transitEstimates.every((estimate) =>
        estimate.originCoarseArea &&
        !Object.hasOwn(estimate, "lat") &&
        !Object.hasOwn(estimate, "lng") &&
        !Object.hasOwn(estimate, "postalCode"),
      )).toBe(true);
      expect(candidate.whyRecommended.length).toBeGreaterThan(0);
      expect(candidate.dietarySuitability.every((item) =>
        ["verified", "reported_compatible", "caution", "incompatible"].includes(item.status) && item.note.length > 0,
      )).toBe(true);
    }
  });

  it("returns no candidates when a hard rule and meal type have no safe overlap", () => {
    const candidates = generateRecommendations({
      runId: "run_no_viable",
      planId: "plan_no_viable",
      participants: [
        {
          participantId: "p1",
          userId: "u1",
          displayName: "Diner 1",
          coarseOriginLabel: "Novena",
          lat: 1.3204,
          lng: 103.8436,
          dietaryRules: [{ id: "unsupported-1", userId: "u1", ruleCode: "unsupported_hard_rule", severity: "hard", createdAt: "" }],
          cuisinePreferences: [],
        },
        {
          participantId: "p2",
          userId: "u2",
          displayName: "Diner 2",
          coarseOriginLabel: "Jurong East",
          lat: 1.3329,
          lng: 103.7436,
          dietaryRules: [],
          cuisinePreferences: [],
        },
      ],
      mealType: "coffee",
      groupBudgetCents: 14_000,
      alcoholMode: "excluded",
      fairnessMode: "equal_journeys",
      shortlistSize: 5,
    });

    expect(candidates).toEqual([]);
  });
});
