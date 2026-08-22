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
});
