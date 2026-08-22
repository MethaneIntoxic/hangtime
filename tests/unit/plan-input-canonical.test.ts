import { describe, expect, it } from "vitest";
import {
  sameAvailabilityWindows,
  sameCuisinePreferences,
  sameDietaryRules,
} from "@/lib/plan-inputs/canonical";

describe("canonical plan-input comparisons", () => {
  it("treats availability windows as an unordered set without dropping duplicates", () => {
    const first = [
      { startTime: "18:30", endTime: "19:30", source: "manual" as const },
      { startTime: "20:00", endTime: "21:30", source: "calendar" as const },
    ];
    const reversed = [...first].reverse();

    expect(sameAvailabilityWindows(first, reversed)).toBe(true);
    expect(sameAvailabilityWindows(first, [...first, first[0]])).toBe(false);
    expect(sameAvailabilityWindows(first, [{ ...first[0], endTime: "19:45" }, first[1]])).toBe(false);
  });

  it("compares dietary rules by recommendation-relevant fields", () => {
    const first = [
      { id: "diet-a", userId: "user", ruleCode: "halal", severity: "hard", note: null, createdAt: "one" },
      { id: "diet-b", userId: "user", ruleCode: "vegetarian", severity: "preference", note: "", createdAt: "two" },
    ];
    const reversed = [...first].reverse().map((rule, index) => ({ ...rule, id: `new-${index}`, createdAt: "later" }));

    expect(sameDietaryRules(first, reversed)).toBe(true);
    expect(sameDietaryRules(first, [{ ...first[0], ruleCode: "vegan" }, first[1]])).toBe(false);
    expect(sameDietaryRules(first, [{ ...first[0], severity: "allergy" }, first[1]])).toBe(false);
    expect(sameDietaryRules(first, [{ ...first[0], note: "Avoid cross-contact" }, first[1]])).toBe(false);
  });

  it("compares cuisine preferences by cuisine code and weight", () => {
    const first = [
      { id: "cuisine-a", userId: "user", cuisineCode: "japanese", weight: 2 },
      { id: "cuisine-b", userId: "user", cuisineCode: "cafe", weight: -1 },
    ];

    expect(sameCuisinePreferences(first, [...first].reverse())).toBe(true);
    expect(sameCuisinePreferences(first, [{ ...first[0], weight: 1 }, first[1]])).toBe(false);
    expect(sameCuisinePreferences(first, [{ ...first[0], cuisineCode: "thai" }, first[1]])).toBe(false);
  });
});
