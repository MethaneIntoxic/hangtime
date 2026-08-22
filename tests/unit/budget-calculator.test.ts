import { describe, it, expect } from "vitest";
import { calculateGroupBudgetEstimate } from "@/domain/budget/calculator";

describe("Budget Calculator & Singapore F&B Charges", () => {
  it("calculates budget estimate incorporating 10% service charge and 9% GST", () => {
    // 2 diners, dinner, tier 2 ($$), alcohol excluded, budget S$140 (14000 cents)
    const est = calculateGroupBudgetEstimate(2, "dinner", 2, "excluded", 14000);

    expect(est.serviceChargePercent).toBe(10);
    expect(est.gstPercent).toBe(9);
    expect(est.minCents).toBeGreaterThan(0);
    expect(est.maxCents).toBeGreaterThan(est.minCents);
    expect(est.fitsBudget).toBe(true);
    expect(est.explanation).toContain("10% svc + 9% GST");
    expect(est.explanation).toContain("alcohol excluded");
  });

  it("adjusts budget calculation when alcohol is included", () => {
    const withoutAlcohol = calculateGroupBudgetEstimate(2, "dinner", 2, "excluded", 14000);
    const withAlcohol = calculateGroupBudgetEstimate(2, "dinner", 2, "included", 14000);

    expect(withAlcohol.minCents).toBeGreaterThan(withoutAlcohol.minCents);
    expect(withAlcohol.maxCents).toBeGreaterThan(withoutAlcohol.maxCents);
    expect(withAlcohol.explanation).toContain("alcohol included");
  });
});
