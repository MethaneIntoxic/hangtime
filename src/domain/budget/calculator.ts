import { MealType, AlcoholMode } from "@/types";

export interface BudgetEstimate {
  minCents: number;
  maxCents: number;
  minFormatted: string;
  maxFormatted: string;
  subtotalMinCents: number;
  subtotalMaxCents: number;
  serviceChargePercent: number;
  gstPercent: number;
  perPersonMinFormatted: string;
  perPersonMaxFormatted: string;
  explanation: string;
  fitsBudget: boolean;
}

// Singapore Base Price Ranges per person (in cents) before tax & service charge
// 1 = $, 2 = $$, 3 = $$$, 4 = $$$$
const BASE_TIER_RANGES_CENTS: Record<MealType, Record<number, [number, number]>> = {
  coffee: {
    1: [400, 800],
    2: [800, 1500],
    3: [1500, 2500],
    4: [2500, 4000],
  },
  brunch: {
    1: [1200, 2000],
    2: [2000, 3500],
    3: [3500, 6000],
    4: [6000, 11000],
  },
  lunch: {
    1: [1000, 1800],
    2: [1800, 3200],
    3: [3200, 5500],
    4: [5500, 10000],
  },
  dinner: {
    1: [1500, 2500],
    2: [2500, 5000],
    3: [5000, 9500],
    4: [9500, 22000],
  },
  drinks: {
    1: [1500, 2500],
    2: [2500, 4500],
    3: [4500, 8000],
    4: [8000, 18000],
  },
};

const ALCOHOL_SURCHARGE_PER_PERSON_CENTS: [number, number] = [2000, 4000];
const SERVICE_CHARGE_RATE = 0.10; // 10%
const GST_RATE = 0.09;            // 9%

export function calculateGroupBudgetEstimate(
  priceTier: number,
  mealType: MealType,
  participantCount: number,
  alcoholMode: AlcoholMode,
  statedGroupBudgetCents: number
): BudgetEstimate {
  const safeTier = Math.max(1, Math.min(4, priceTier));
  const [baseMin, baseMax] = BASE_TIER_RANGES_CENTS[mealType][safeTier] || [2500, 5000];

  let perPersonMin = baseMin;
  let perPersonMax = baseMax;

  if (alcoholMode === "included") {
    perPersonMin += ALCOHOL_SURCHARGE_PER_PERSON_CENTS[0];
    perPersonMax += ALCOHOL_SURCHARGE_PER_PERSON_CENTS[1];
  }

  const subtotalMinCents = perPersonMin * participantCount;
  const subtotalMaxCents = perPersonMax * participantCount;

  // In Singapore F&B: Subtotal + 10% Service Charge, then 9% GST on total
  const multiplier = (1 + SERVICE_CHARGE_RATE) * (1 + GST_RATE);
  const minCents = Math.round(subtotalMinCents * multiplier);
  const maxCents = Math.round(subtotalMaxCents * multiplier);

  const minSGD = Math.round(minCents / 100);
  const maxSGD = Math.round(maxCents / 100);
  const perPersonMinSGD = Math.round(minCents / participantCount / 100);
  const perPersonMaxSGD = Math.round(maxCents / participantCount / 100);

  const fitsBudget = minCents <= statedGroupBudgetCents;

  const alcoholNote = alcoholMode === "included" ? "alcohol included" : "alcohol excluded";
  const explanation = `Estimated group spend: S$${minSGD}–S$${maxSGD} for ${participantCount} (incl. 10% svc + 9% GST; ${alcoholNote}).`;

  return {
    minCents,
    maxCents,
    minFormatted: `S$${minSGD}`,
    maxFormatted: `S$${maxSGD}`,
    subtotalMinCents,
    subtotalMaxCents,
    serviceChargePercent: 10,
    gstPercent: 9,
    perPersonMinFormatted: `S$${perPersonMinSGD}`,
    perPersonMaxFormatted: `S$${perPersonMaxSGD}`,
    explanation,
    fitsBudget,
  };
}
