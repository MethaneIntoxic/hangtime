import { blob, index, primaryKey, sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarPath: text("avatar_path"),
  accountKind: text("account_kind").notNull().default("full"), // 'full' | 'guest'
  timezone: text("timezone").notNull().default("Asia/Singapore"),
  coarseArea: text("coarse_area"),
  notificationPrefs: text("notification_prefs").default('{"email":true,"push":false}'),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const diningCompanions = sqliteTable("dining_companions", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  companionUserId: text("companion_user_id").notNull(),
  status: text("status").notNull().default("accepted"), // 'pending' | 'accepted'
  isFavourite: integer("is_favourite").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const dietaryRules = sqliteTable("dietary_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  ruleCode: text("rule_code").notNull(),
  severity: text("severity").notNull(), // 'allergy' | 'hard' | 'preference'
  note: text("note"),
  createdAt: text("created_at").notNull(),
});

export const cuisinePreferences = sqliteTable("cuisine_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  cuisineCode: text("cuisine_code").notNull(),
  weight: integer("weight").notNull().default(0), // -2 to +2
});

export const calendarConnections = sqliteTable("calendar_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull().default("google"),
  status: text("status").notNull().default("connected"),
  updatedAt: text("updated_at").notNull(),
});

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  organizerId: text("organizer_id").notNull(),
  state: text("state").notNull().default("draft"),
  // 'draft' | 'collecting' | 'recommending' | 'voting' | 'confirmed' | 'completed' | 'cancelled'
  version: integer("version").notNull().default(1),
  date: text("date").notNull(),
  windowStart: text("window_start").notNull(),
  windowEnd: text("window_end").notNull(),
  mealType: text("meal_type").notNull().default("dinner"), // 'brunch' | 'coffee' | 'lunch' | 'dinner' | 'drinks'
  groupBudgetCents: integer("group_budget_cents").notNull().default(12000), // in SGD cents
  alcoholMode: text("alcohol_mode").notNull().default("excluded"), // 'included' | 'excluded'
  fairnessMode: text("fairness_mode").notNull().default("equal_journeys"), // 'equal_journeys' | 'lowest_total_time'
  timezone: text("timezone").notNull().default("Asia/Singapore"),
  shortlistSize: integer("shortlist_size").notNull().default(5),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const planParticipants = sqliteTable("plan_participants", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("member"), // 'organizer' | 'member'
  coarseOriginLabel: text("coarse_origin_label"),
  isReady: integer("is_ready").notNull().default(0),
  dietaryDeclared: integer("dietary_declared").notNull().default(0),
  acknowledgedState: text("acknowledged_state").notNull().default("pending"), // 'pending' | 'acknowledged' | 'conflict'
  joinedAt: text("joined_at").notNull(),
}, (table) => [
  uniqueIndex("plan_participants_plan_user_uq").on(table.planId, table.userId),
]);

export const planInvites = sqliteTable("plan_invites", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  email: text("email"),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  reservationKind: text("reservation_kind"),
  reservedUserId: text("reserved_user_id"),
  intendedEmailHash: text("intended_email_hash"),
  revokedAt: text("revoked_at"),
  acceptedUserId: text("accepted_user_id"),
  supersededByInviteId: text("superseded_by_invite_id"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("plan_invites_plan_status_idx").on(table.planId, table.acceptedAt, table.revokedAt, table.expiresAt),
  index("plan_invites_plan_email_status_idx").on(table.planId, table.intendedEmailHash, table.acceptedAt, table.revokedAt),
  index("plan_invites_plan_user_status_idx").on(table.planId, table.reservedUserId, table.acceptedAt, table.revokedAt),
]);

export const availabilityWindows = sqliteTable("availability_windows", {
  id: text("id").primaryKey(),
  participantId: text("participant_id").notNull(),
  planId: text("plan_id").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  source: text("source").notNull().default("manual"), // 'manual' | 'calendar'
});

export const recommendationRuns = sqliteTable("recommendation_runs", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  planVersion: integer("plan_version").notNull(),
  algorithmVersion: text("algorithm_version").notNull().default("v1.0"),
  status: text("status").notNull().default("queued"), // 'queued' | 'processing' | 'completed' | 'failed'
  weightsJson: text("weights_json"),
  failureReason: text("failure_reason"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("recommendation_runs_plan_version_uq").on(table.planId, table.planVersion),
]);

export const recommendationCandidates = sqliteTable("recommendation_candidates", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  rank: integer("rank").notNull(),
  venueId: text("venue_id").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  coarseArea: text("coarse_area").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  cuisine: text("cuisine").notNull(),
  priceTier: integer("price_tier").notNull(), // 1 to 4 ($ to $$$$)
  priceRangeMinCents: integer("price_range_min_cents").notNull(),
  priceRangeMaxCents: integer("price_range_max_cents").notNull(),
  rating: real("rating").notNull(),
  ratingCount: integer("rating_count").notNull(),
  badgesJson: text("badges_json").notNull(), // stringified array of badge objects
  transitEstimatesJson: text("transit_estimates_json").notNull(), // per-participant transit
  dietarySuitabilityJson: text("dietary_suitability_json").notNull(),
  bookingUrl: text("booking_url"),
  mapsUrl: text("maps_url"),
  whyRecommended: text("why_recommended").notNull(),
  createdAt: text("created_at").notNull(),
});

export const candidateScores = sqliteTable("candidate_scores", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  fairnessScore: real("fairness_score").notNull(),
  totalTravelScore: real("total_travel_score").notNull(),
  foodMatchScore: real("food_match_score").notNull(),
  budgetFitScore: real("budget_fit_score").notNull(),
  qualityScore: real("quality_score").notNull(),
  totalScore: real("total_score").notNull(),
  tieBreakerSeed: integer("tie_breaker_seed").notNull().default(0),
});

export const ballots = sqliteTable("ballots", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  runId: text("run_id").notNull(),
  userId: text("user_id").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("ballots_plan_run_user_uq").on(table.planId, table.runId, table.userId),
]);

export const ballotSelections = sqliteTable("ballot_selections", {
  id: text("id").primaryKey(),
  ballotId: text("ballot_id").notNull(),
  candidateId: text("candidate_id").notNull(),
});

export const planDecisions = sqliteTable("plan_decisions", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  candidateId: text("candidate_id").notNull(),
  exactStartTime: text("exact_start_time").notNull(),
  decisionKind: text("decision_kind").notNull().default("winner"), // 'winner' | 'override'
  overrideReason: text("override_reason"),
  decidedBy: text("decided_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("plan_decisions_plan_uq").on(table.planId),
]);

export const planEvents = sqliteTable("plan_events", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  eventType: text("event_type").notNull(),
  actorId: text("actor_id").notNull(),
  payloadJson: text("payload_json"),
  createdAt: text("created_at").notNull(),
});

export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  userId: text("user_id").notNull(),
  satisfactionScore: integer("satisfaction_score").notNull(), // 1 to 5
  reuseIntent: integer("reuse_intent").notNull(), // 1 for yes, 0 for no
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const notificationOutbox = sqliteTable("notification_outbox", {
  id: text("id").primaryKey(),
  recipientEmail: text("recipient_email").notNull(),
  recipientId: text("recipient_id"),
  channel: text("channel").notNull().default("in_app"),
  template: text("template").notNull(),
  payloadJson: text("payload_json").notNull(),
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull(),
});

export const authMagicLinks = sqliteTable("auth_magic_links", {
  id: text("id").primaryKey(),
  emailNormalized: text("email_normalized").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  providerMessageId: text("provider_message_id"),
  createdAt: text("created_at").notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const authRateLimits = sqliteTable("auth_rate_limits", {
  keyHash: text("key_hash").notNull(),
  bucketStart: text("bucket_start").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.keyHash, table.bucketStart] }),
]);

export const privateLocations = sqliteTable("private_locations", {
  id: text("id").primaryKey(),
  subjectKind: text("subject_kind").notNull(),
  subjectId: text("subject_id").notNull().unique(),
  ownerUserId: text("owner_user_id").notNull(),
  planId: text("plan_id"),
  ciphertext: blob("ciphertext", { mode: "buffer" }).notNull(),
  nonce: blob("nonce", { mode: "buffer" }).notNull(),
  authTag: blob("auth_tag", { mode: "buffer" }).notNull(),
  keyVersion: text("key_version").notNull(),
  payloadVersion: integer("payload_version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
