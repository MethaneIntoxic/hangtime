import { describe, it, expect } from "vitest";
import { evaluateDietarySuitability } from "@/domain/dietary/rules";

describe("Dietary Restrictions & Allergen Rules", () => {
  it("verifies halal-certified venues for halal diners", () => {
    const halalRules = [
      { id: "1", userId: "u1", ruleCode: "halal", severity: "hard" as const, createdAt: "" },
    ];
    const halalVenueAttrs = {
      isHalalCertified: true,
      isMuslimOwned: true,
      isPorkFree: true,
    };

    const evalResult = evaluateDietarySuitability(halalRules, halalVenueAttrs);
    expect(evalResult.isCompatible).toBe(true);
    expect(evalResult.suitabilityList.some((s) => s.ruleCode === "halal" && s.status === "verified")).toBe(true);
  });

  it("strictly filters non-halal venues when severity is hard", () => {
    const halalRules = [
      { id: "1", userId: "u1", ruleCode: "halal", severity: "hard" as const, createdAt: "" },
    ];
    const nonHalalVenue = {
      isHalalCertified: false,
      isPorkFree: false,
    };

    const evalResult = evaluateDietarySuitability(halalRules, nonHalalVenue);
    expect(evalResult.isCompatible).toBe(false);
    expect(evalResult.bindingConstraint).toContain("Halal");
  });

  it("checks vegetarian and allergen safety warnings", () => {
    const nutRule = [
      { id: "2", userId: "u1", ruleCode: "nut_allergy", severity: "allergy" as const, createdAt: "" },
    ];
    const venue = {
      hasNutFreeOptions: true,
    };

    const evalResult = evaluateDietarySuitability(nutRule, venue);
    expect(evalResult.isCompatible).toBe(true);
    expect(evalResult.suitabilityList[0].note).toContain("Nut-aware");
  });

  it.each([
    ["nut_allergy", "Nut allergy"],
    ["shellfish", "Shellfish allergy"],
    ["dairy_free", "Dairy-free"],
    ["gluten_free", "Gluten-free"],
    ["beef_free", "No beef"],
  ])("excludes unknown %s evidence when the rule is strict", (ruleCode, bindingLabel) => {
    const result = evaluateDietarySuitability(
      [
        {
          id: `rule-${ruleCode}`,
          userId: "u1",
          ruleCode,
          severity: "allergy" as const,
          createdAt: "",
        },
      ],
      {}
    );

    expect(result.isCompatible).toBe(false);
    expect(result.isCaution).toBe(true);
    expect(result.bindingConstraint).toContain(bindingLabel);
    expect(result.suitabilityList[0].status).toBe("incompatible");
  });

  it("keeps unknown preference-level evidence visible without excluding the venue", () => {
    const result = evaluateDietarySuitability(
      [
        {
          id: "rule-preference",
          userId: "u1",
          ruleCode: "dairy_free",
          severity: "preference" as const,
          createdAt: "",
        },
      ],
      {}
    );

    expect(result.isCompatible).toBe(true);
    expect(result.isCaution).toBe(true);
    expect(result.suitabilityList[0].status).toBe("caution");
  });
});
