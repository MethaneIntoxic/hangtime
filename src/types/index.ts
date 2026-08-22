export type AccountKind = "full" | "guest";
export type CompanionStatus = "pending" | "accepted";
export type DietarySeverity = "allergy" | "hard" | "preference";
export type MealType = "brunch" | "coffee" | "lunch" | "dinner" | "drinks";
export type AlcoholMode = "included" | "excluded";
export type FairnessMode = "equal_journeys" | "lowest_total_time";
export type PlanState =
  | "draft"
  | "collecting"
  | "recommending"
  | "voting"
  | "confirmed"
  | "completed"
  | "cancelled";
export type ParticipantRole = "organizer" | "member";
export type AcknowledgedState = "pending" | "acknowledged" | "conflict";
export type DecisionKind = "winner" | "override";
export type RecommendationStatus = "queued" | "processing" | "completed" | "failed";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarPath?: string | null;
  accountKind: AccountKind;
  timezone: string;
  coarseArea: string;
  notificationPrefs: {
    email: boolean;
    push: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DiningCompanionInfo {
  id: string;
  ownerUserId: string;
  companionUserId: string;
  status: CompanionStatus;
  isFavourite: boolean;
  companionProfile: UserProfile;
  createdAt: string;
}

export interface DietaryRule {
  id: string;
  userId: string;
  ruleCode: string;
  severity: DietarySeverity;
  note?: string | null;
  createdAt: string;
}

export interface CuisinePreference {
  id: string;
  userId: string;
  cuisineCode: string;
  weight: number; // -2 (dislike) to +2 (love)
}

export interface PlanParticipant {
  id: string;
  planId: string;
  userId: string;
  role: ParticipantRole;
  coarseOriginLabel?: string | null;
  isReady: boolean;
  /** Explicit acknowledgement that dietary rules/preferences were reviewed for this plan. */
  dietaryDeclared?: boolean;
  acknowledgedState: AcknowledgedState;
  joinedAt: string;
  profile?: UserProfile;
  dietaryRules?: DietaryRule[];
  cuisinePreferences?: CuisinePreference[];
  availability?: AvailabilityWindow[];
}

export interface AvailabilityWindowInput {
  startTime: string;
  endTime: string;
  source: "manual" | "calendar";
}

export interface AvailabilityWindow {
  id: string;
  participantId: string;
  planId: string;
  startTime: string; // "19:00"
  endTime: string;   // "21:00"
  source: "manual" | "calendar";
}

export interface Plan {
  id: string;
  organizerId: string;
  state: PlanState;
  version: number;
  date: string; // "2026-09-05"
  windowStart: string; // "18:30"
  windowEnd: string; // "20:30"
  mealType: MealType;
  groupBudgetCents: number;
  alcoholMode: AlcoholMode;
  fairnessMode: FairnessMode;
  timezone: string;
  shortlistSize: number;
  createdAt: string;
  updatedAt: string;
  participants?: PlanParticipant[];
  currentRun?: RecommendationRun;
  activeDecision?: PlanDecision;
}

export interface RecommendationBadge {
  id: string;
  label: string;
  iconName: string;
  variant: "terra" | "sage" | "amber" | "plum" | "neutral";
  tooltip?: string;
}

export interface ParticipantTransitEstimate {
  participantId: string;
  displayName: string;
  originCoarseArea: string;
  durationMinutes: number;
  transitSummary: string; // "MRT (East West Line) · 24 mins"
  mrtLines: string[];
}

export interface DietarySuitabilityInfo {
  ruleCode: string;
  status: "verified" | "reported_compatible" | "caution" | "incompatible";
  note: string;
}

export interface RecommendationCandidate {
  id: string;
  runId: string;
  rank: number;
  venueId: string;
  name: string;
  address: string;
  coarseArea: string;
  lat: number;
  lng: number;
  cuisine: string;
  priceTier: number; // 1, 2, 3, 4
  priceRangeMinCents: number;
  priceRangeMaxCents: number;
  rating: number;
  ratingCount: number;
  badges: RecommendationBadge[];
  transitEstimates: ParticipantTransitEstimate[];
  dietarySuitability: DietarySuitabilityInfo[];
  bookingUrl?: string | null;
  mapsUrl?: string | null;
  whyRecommended: string;
  scores?: {
    fairness: number;
    totalTravel: number;
    foodMatch: number;
    budgetFit: number;
    quality: number;
    total: number;
  };
}

export interface RecommendationRun {
  id: string;
  planId: string;
  planVersion: number;
  algorithmVersion: string;
  status: RecommendationStatus;
  weightsJson?: string | null;
  failureReason?: string | null;
  createdAt: string;
  candidates?: RecommendationCandidate[];
}

export interface Ballot {
  id: string;
  planId: string;
  runId: string;
  userId: string;
  updatedAt: string;
  candidateIds: string[];
}

export interface PlanDecision {
  id: string;
  planId: string;
  candidateId: string;
  exactStartTime: string;
  decisionKind: DecisionKind;
  overrideReason?: string | null;
  decidedBy: string;
  createdAt: string;
  candidate?: RecommendationCandidate;
}

export interface PlanEvent {
  id: string;
  planId: string;
  eventType: string;
  actorId: string;
  payloadJson?: string | null;
  createdAt: string;
}

export interface FeedbackSubmission {
  id: string;
  planId: string;
  userId: string;
  satisfactionScore: number; // 1 to 5
  reuseIntent: boolean;
  notes?: string | null;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
  requestId: string;
}

export interface ParticipationUpdateInput {
  coarseOriginLabel?: string | null;
  isReady?: boolean;
  dietaryDeclared?: boolean;
  availability?: AvailabilityWindowInput[];
  inviteToken?: string;
}
