import {
  FairnessMode,
  MealType,
  AlcoholMode,
  DietaryRule,
  CuisinePreference,
  RecommendationCandidate,
  RecommendationBadge,
  ParticipantTransitEstimate,
} from "@/types";
import { SINGAPORE_VENUES, CuratedSingaporeVenue } from "@/providers/singapore-venues";
import { openStreetMapVenueUrl } from "@/providers/open-map";
import { estimateSingaporeTransit } from "@/providers/singapore-transit";
import { evaluateDietarySuitability } from "@/domain/dietary/rules";
import { calculateGroupBudgetEstimate } from "@/domain/budget/calculator";

export interface ParticipantPlanningInput {
  participantId: string;
  userId: string;
  displayName: string;
  coarseOriginLabel: string;
  lat: number;
  lng: number;
  dietaryRules: DietaryRule[];
  cuisinePreferences: CuisinePreference[];
}

export interface RecommendationRunInput {
  runId: string;
  planId: string;
  participants: ParticipantPlanningInput[];
  mealType: MealType;
  groupBudgetCents: number;
  alcoholMode: AlcoholMode;
  fairnessMode: FairnessMode;
  shortlistSize?: number;
}

export interface ScoredCandidate {
  venue: CuratedSingaporeVenue;
  transitEstimates: ParticipantTransitEstimate[];
  minTransitMins: number;
  maxTransitMins: number;
  sumTransitMins: number;
  fairnessScore: number;
  totalTravelScore: number;
  foodMatchScore: number;
  budgetFitScore: number;
  qualityScore: number;
  totalScore: number;
  badges: RecommendationBadge[];
  whyRecommended: string;
  dietarySuitability: ReturnType<typeof evaluateDietarySuitability>["suitabilityList"];
  budgetEstimate: ReturnType<typeof calculateGroupBudgetEstimate>;
}

function clamp(val: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, val));
}

export function generateRecommendations(
  input: RecommendationRunInput
): RecommendationCandidate[] {
  const {
    runId,
    participants,
    mealType,
    groupBudgetCents,
    alcoholMode,
    fairnessMode,
    shortlistSize = 5,
  } = input;

  const allDietaryRules: DietaryRule[] = participants.flatMap(
    (p) => p.dietaryRules
  );
  const scoredPool: ScoredCandidate[] = [];

  for (const venue of SINGAPORE_VENUES) {
    // Hard Filter 1: Meal type support
    if (!venue.supportedMealTypes.includes(mealType)) {
      continue;
    }

    // Hard Filter 2: Dietary restrictions
    const dietaryEval = evaluateDietarySuitability(allDietaryRules, venue.dietary);
    if (!dietaryEval.isCompatible) {
      continue;
    }

    // Transit calculation for each participant
    const transitEstimates: ParticipantTransitEstimate[] = [];
    let minTransit = Infinity;
    let maxTransit = -Infinity;
    let sumTransit = 0;

    for (const p of participants) {
      const transit = estimateSingaporeTransit(
        p.lat,
        p.lng,
        venue.lat,
        venue.lng,
        p.coarseOriginLabel
      );
      transitEstimates.push({
        participantId: p.participantId,
        displayName: p.displayName,
        originCoarseArea: p.coarseOriginLabel,
        durationMinutes: transit.durationMinutes,
        transitSummary: transit.transitSummary,
        mrtLines: transit.mrtLines,
      });

      if (transit.durationMinutes < minTransit) minTransit = transit.durationMinutes;
      if (transit.durationMinutes > maxTransit) maxTransit = transit.durationMinutes;
      sumTransit += transit.durationMinutes;
    }

    // Component Scores [0, 1]
    // 1. Fairness: journey difference tolerance ~25 mins
    const diff = Math.max(0, maxTransit - minTransit);
    const fairnessScore = 1 - clamp(diff / 25);

    // 2. Total Travel: tolerance ~ 40m per person
    const avgTransit = sumTransit / Math.max(1, participants.length);
    const totalTravelScore = 1 - clamp((avgTransit - 10) / 35);

    // 3. Food Match: preference weights across all participants
    let prefScoreSum = 0;
    let prefCount = 0;
    for (const p of participants) {
      for (const pref of p.cuisinePreferences) {
        if (venue.cuisineCodes.includes(pref.cuisineCode)) {
          // weight is -2 to +2 -> normalize to 0 to 1
          prefScoreSum += (pref.weight + 2) / 4;
          prefCount += 1;
        }
      }
    }
    const foodMatchScore = prefCount > 0 ? clamp(prefScoreSum / prefCount) : 0.65;

    // 4. Budget Fit
    const budgetEstimate = calculateGroupBudgetEstimate(
      venue.priceTier,
      mealType,
      participants.length,
      alcoholMode,
      groupBudgetCents
    );
    let budgetFitScore = 1.0;
    if (budgetEstimate.maxCents > groupBudgetCents) {
      const overageRatio = (budgetEstimate.maxCents - groupBudgetCents) / groupBudgetCents;
      budgetFitScore = clamp(1.0 - overageRatio * 1.5);
    }

    // 5. Quality Score: Bayesian adjustment based on rating
    const qualityScore = clamp((venue.rating - 3.5) / 1.5);

    // Composite Weights
    let totalScore: number;
    if (fairnessMode === "equal_journeys") {
      totalScore =
        0.30 * fairnessScore +
        0.20 * totalTravelScore +
        0.25 * foodMatchScore +
        0.20 * budgetFitScore +
        0.05 * qualityScore;
    } else {
      totalScore =
        0.20 * fairnessScore +
        0.30 * totalTravelScore +
        0.25 * foodMatchScore +
        0.20 * budgetFitScore +
        0.05 * qualityScore;
    }

    // Badges Generation
    const badges: RecommendationBadge[] = [];

    if (diff <= 8) {
      badges.push({
        id: "fairest_trip",
        label: "Fairest Trip",
        iconName: "Scale",
        variant: "sage",
        tooltip: `Only ${diff}m difference between all diners`,
      });
    } else if (avgTransit <= 22) {
      badges.push({
        id: "fast_transit",
        label: "Super Quick Trip",
        iconName: "Zap",
        variant: "sage",
        tooltip: `Under 22 mins average transit time`,
      });
    }

    if (foodMatchScore >= 0.75) {
      badges.push({
        id: "food_match",
        label: "Top Food Match",
        iconName: "Sparkles",
        variant: "terra",
        tooltip: "Matches group cuisine preferences",
      });
    }

    if (budgetEstimate.fitsBudget) {
      badges.push({
        id: "within_budget",
        label: "Likely in Budget",
        iconName: "BadgePercent",
        variant: "amber",
        tooltip: `Estimated within S$${Math.round(groupBudgetCents / 100)} group budget`,
      });
    }

    if (venue.rating >= 4.6) {
      badges.push({
        id: "top_rated",
        label: `★ ${venue.rating} (${venue.ratingCount.toLocaleString()}+)`,
        iconName: "Star",
        variant: "plum",
      });
    }

    if (venue.dietary.isHalalCertified) {
      badges.push({
        id: "halal_certified",
        label: "Halal Certified",
        iconName: "Moon",
        variant: "sage",
      });
    }

    // Plain English explanation
    let whyRecommended = "";
    if (diff <= 8) {
      whyRecommended = `Fairest trip: ${minTransit}–${maxTransit} minutes per person by public transport.`;
    } else if (foodMatchScore >= 0.8) {
      whyRecommended = `Best food match: ${venue.cuisine} is highly favoured by your group.`;
    } else if (budgetEstimate.fitsBudget) {
      whyRecommended = `Great budget fit: ${budgetEstimate.minFormatted}–${budgetEstimate.maxFormatted} for ${participants.length} diners.`;
    } else {
      whyRecommended = `Central location in ${venue.coarseArea} with outstanding group ratings (${venue.rating}★).`;
    }

    scoredPool.push({
      venue,
      transitEstimates,
      minTransitMins: minTransit,
      maxTransitMins: maxTransit,
      sumTransitMins: sumTransit,
      fairnessScore,
      totalTravelScore,
      foodMatchScore,
      budgetFitScore,
      qualityScore,
      totalScore,
      badges,
      whyRecommended,
      dietarySuitability: dietaryEval.suitabilityList,
      budgetEstimate,
    });
  }

  // Sort by total score descending
  scoredPool.sort((a, b) => b.totalScore - a.totalScore);

  // Apply Diversity Filtering so shortlist has varied cuisines & clusters
  const selected: ScoredCandidate[] = [];
  const seenClusters = new Set<string>();
  const seenCuisines = new Set<string>();

  // Pass 1: pick diverse top candidates
  for (const item of scoredPool) {
    if (selected.length >= shortlistSize) break;
    const cluster = item.venue.cluster;
    const primaryCuisine = item.venue.cuisineCodes[0] || "other";

    if (!seenClusters.has(cluster) || !seenCuisines.has(primaryCuisine) || selected.length < 2) {
      selected.push(item);
      seenClusters.add(cluster);
      seenCuisines.add(primaryCuisine);
    }
  }

  // Pass 2: fill remaining slots if needed
  for (const item of scoredPool) {
    if (selected.length >= shortlistSize) break;
    if (!selected.some((s) => s.venue.id === item.venue.id)) {
      selected.push(item);
    }
  }

  // Map to RecommendationCandidate DTOs
  return selected.map((sc, index) => {
    return {
      id: `rc-${runId}-${sc.venue.id}`,
      runId,
      rank: index + 1,
      venueId: sc.venue.id,
      name: sc.venue.name,
      address: sc.venue.address,
      coarseArea: sc.venue.coarseArea,
      lat: sc.venue.lat,
      lng: sc.venue.lng,
      cuisine: sc.venue.cuisine,
      priceTier: sc.venue.priceTier,
      priceRangeMinCents: sc.budgetEstimate.minCents,
      priceRangeMaxCents: sc.budgetEstimate.maxCents,
      rating: sc.venue.rating,
      ratingCount: sc.venue.ratingCount,
      badges: sc.badges,
      transitEstimates: sc.transitEstimates,
      dietarySuitability: sc.dietarySuitability,
      bookingUrl: sc.venue.bookingUrl,
      mapsUrl: openStreetMapVenueUrl(sc.venue.lat, sc.venue.lng),
      whyRecommended: sc.whyRecommended,
      scores: {
        fairness: Number(sc.fairnessScore.toFixed(3)),
        totalTravel: Number(sc.totalTravelScore.toFixed(3)),
        foodMatch: Number(sc.foodMatchScore.toFixed(3)),
        budgetFit: Number(sc.budgetFitScore.toFixed(3)),
        quality: Number(sc.qualityScore.toFixed(3)),
        total: Number(sc.totalScore.toFixed(3)),
      },
    };
  });
}
