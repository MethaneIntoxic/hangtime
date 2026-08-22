import { client, db, schema } from "./index";
import { generateRecommendations } from "@/domain/recommendations/scorer";
import { saveParticipantLocation, saveProfileLocation } from "@/lib/location/service";

export async function seedDatabase() {
  console.log("🌱 Seeding Hangtime database...");

  // Clear existing records
  await client.executeMultiple(`
    DELETE FROM private_locations;
    DELETE FROM feedback;
    DELETE FROM plan_events;
    DELETE FROM plan_decisions;
    DELETE FROM ballot_selections;
    DELETE FROM ballots;
    DELETE FROM candidate_scores;
    DELETE FROM recommendation_candidates;
    DELETE FROM recommendation_runs;
    DELETE FROM availability_windows;
    DELETE FROM plan_invites;
    DELETE FROM plan_participants;
    DELETE FROM plans;
    DELETE FROM calendar_connections;
    DELETE FROM cuisine_preferences;
    DELETE FROM dietary_rules;
    DELETE FROM dining_companions;
    DELETE FROM profiles;
  `);

  const now = new Date().toISOString();

  // 1. Create User Profiles
  const mayaProfile = {
    id: "user_maya",
    email: "maya@dinnertime.sg",
    displayName: "Maya Chen",
    avatarPath: "https://api.dicebear.com/7.x/notionists/svg?seed=Maya",
    accountKind: "full" as const,
    timezone: "Asia/Singapore",
    coarseArea: "Novena / Balestier (Central)",
    notificationPrefs: JSON.stringify({ email: true, push: true }),
    createdAt: now,
    updatedAt: now,
  };

  const ethanProfile = {
    id: "user_ethan",
    email: "ethan@dinnertime.sg",
    displayName: "Ethan Tan",
    avatarPath: "https://api.dicebear.com/7.x/notionists/svg?seed=Ethan",
    accountKind: "full" as const,
    timezone: "Asia/Singapore",
    coarseArea: "Jurong East / Clementi (West)",
    notificationPrefs: JSON.stringify({ email: true, push: false }),
    createdAt: now,
    updatedAt: now,
  };

  const claraProfile = {
    id: "user_clara",
    email: "clara@dinnertime.sg",
    displayName: "Clara Lee",
    avatarPath: "https://api.dicebear.com/7.x/notionists/svg?seed=Clara",
    accountKind: "full" as const,
    timezone: "Asia/Singapore",
    coarseArea: "Tampines / Pasir Ris (East)",
    notificationPrefs: JSON.stringify({ email: true, push: false }),
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.profiles).values([mayaProfile, ethanProfile, claraProfile]);
  await saveProfileLocation("user_maya", { postalCode: "307683", lat: 1.3204, lng: 103.8436 });
  await saveProfileLocation("user_ethan", { postalCode: "609731", lat: 1.3329, lng: 103.7436 });
  await saveProfileLocation("user_clara", { postalCode: "529538", lat: 1.3533, lng: 103.9452 });

  // 2. Dining Companions
  await db.insert(schema.diningCompanions).values([
    {
      id: "dc_maya_ethan",
      ownerUserId: "user_maya",
      companionUserId: "user_ethan",
      status: "accepted",
      isFavourite: 1,
      createdAt: now,
    },
    {
      id: "dc_ethan_maya",
      ownerUserId: "user_ethan",
      companionUserId: "user_maya",
      status: "accepted",
      isFavourite: 1,
      createdAt: now,
    },
    {
      id: "dc_maya_clara",
      ownerUserId: "user_maya",
      companionUserId: "user_clara",
      status: "accepted",
      isFavourite: 0,
      createdAt: now,
    },
  ]);

  // 3. Dietary Rules
  await db.insert(schema.dietaryRules).values([
    {
      id: "diet_maya_nut",
      userId: "user_maya",
      ruleCode: "nut_allergy",
      severity: "allergy",
      note: "Severe peanut allergy",
      createdAt: now,
    },
    {
      id: "diet_clara_halal",
      userId: "user_clara",
      ruleCode: "halal",
      severity: "hard",
      note: "Strictly halal or Muslim-owned only",
      createdAt: now,
    },
  ]);

  // 4. Cuisine Preferences
  await db.insert(schema.cuisinePreferences).values([
    { id: "cp_maya_jp", userId: "user_maya", cuisineCode: "japanese", weight: 2 },
    { id: "cp_maya_it", userId: "user_maya", cuisineCode: "italian", weight: 2 },
    { id: "cp_maya_mx", userId: "user_maya", cuisineCode: "mexican", weight: 1 },
    { id: "cp_maya_cf", userId: "user_maya", cuisineCode: "cafe", weight: 1 },
    { id: "cp_ethan_jp", userId: "user_ethan", cuisineCode: "japanese", weight: 2 },
    { id: "cp_ethan_it", userId: "user_ethan", cuisineCode: "italian", weight: 1 },
    { id: "cp_ethan_as", userId: "user_ethan", cuisineCode: "asian", weight: 2 },
    { id: "cp_clara_hl", userId: "user_clara", cuisineCode: "halal", weight: 2 },
    { id: "cp_clara_it", userId: "user_clara", cuisineCode: "italian", weight: 2 },
    { id: "cp_clara_me", userId: "user_clara", cuisineCode: "middle_eastern", weight: 2 },
  ]);

  // 5. Seed Plan 1: Active in Voting State (Maya + Ethan)
  const planVotingId = "plan_friday_dinner";
  await db.insert(schema.plans).values({
    id: planVotingId,
    organizerId: "user_maya",
    state: "voting",
    version: 3,
    date: "2026-08-21",
    windowStart: "19:00",
    windowEnd: "21:30",
    mealType: "dinner",
    groupBudgetCents: 14000,
    alcoholMode: "excluded",
    fairnessMode: "equal_journeys",
    timezone: "Asia/Singapore",
    shortlistSize: 5,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.planParticipants).values([
    {
      id: "part_voting_maya",
      planId: planVotingId,
      userId: "user_maya",
      role: "organizer",
      coarseOriginLabel: "Novena / Balestier (Central)",
      isReady: 1,
      acknowledgedState: "pending",
      joinedAt: now,
    },
    {
      id: "part_voting_ethan",
      planId: planVotingId,
      userId: "user_ethan",
      role: "member",
      coarseOriginLabel: "Jurong East / Clementi (West)",
      isReady: 1,
      acknowledgedState: "pending",
      joinedAt: now,
    },
  ]);
  await saveParticipantLocation(
    { participantId: "part_voting_maya", userId: "user_maya", planId: planVotingId },
    { postalCode: "307683", lat: 1.3204, lng: 103.8436 },
  );
  await saveParticipantLocation(
    { participantId: "part_voting_ethan", userId: "user_ethan", planId: planVotingId },
    { postalCode: "609731", lat: 1.3329, lng: 103.7436 },
  );

  // Run recommendations for Plan 1
  const run1Id = "run_demo_01";
  await db.insert(schema.recommendationRuns).values({
    id: run1Id,
    planId: planVotingId,
    planVersion: 2,
    algorithmVersion: "v1.0",
    status: "completed",
    weightsJson: JSON.stringify({ fairness: 0.3, totalTravel: 0.2, foodMatch: 0.25, budgetFit: 0.2, quality: 0.05 }),
    createdAt: now,
  });

  const candidates1 = generateRecommendations({
    runId: run1Id,
    planId: planVotingId,
    participants: [
      {
        participantId: "part_voting_maya",
        userId: "user_maya",
        displayName: "Maya Chen",
        coarseOriginLabel: "Novena (Central)",
        lat: 1.3204,
        lng: 103.8436,
        dietaryRules: [{ id: "1", userId: "user_maya", ruleCode: "nut_allergy", severity: "allergy", createdAt: now }],
        cuisinePreferences: [
          { id: "1", userId: "user_maya", cuisineCode: "japanese", weight: 2 },
          { id: "2", userId: "user_maya", cuisineCode: "italian", weight: 2 },
        ],
      },
      {
        participantId: "part_voting_ethan",
        userId: "user_ethan",
        displayName: "Ethan Tan",
        coarseOriginLabel: "Jurong East (West)",
        lat: 1.3329,
        lng: 103.7436,
        dietaryRules: [],
        cuisinePreferences: [
          { id: "3", userId: "user_ethan", cuisineCode: "japanese", weight: 2 },
          { id: "4", userId: "user_ethan", cuisineCode: "asian", weight: 2 },
        ],
      },
    ],
    mealType: "dinner",
    groupBudgetCents: 14000,
    alcoholMode: "excluded",
    fairnessMode: "equal_journeys",
    shortlistSize: 5,
  });

  for (const c of candidates1) {
    await db.insert(schema.recommendationCandidates).values({
      id: c.id,
      runId: c.runId,
      rank: c.rank,
      venueId: c.venueId,
      name: c.name,
      address: c.address,
      coarseArea: c.coarseArea,
      lat: c.lat,
      lng: c.lng,
      cuisine: c.cuisine,
      priceTier: c.priceTier,
      priceRangeMinCents: c.priceRangeMinCents,
      priceRangeMaxCents: c.priceRangeMaxCents,
      rating: c.rating,
      ratingCount: c.ratingCount,
      badgesJson: JSON.stringify(c.badges),
      transitEstimatesJson: JSON.stringify(c.transitEstimates),
      dietarySuitabilityJson: JSON.stringify(c.dietarySuitability),
      bookingUrl: c.bookingUrl,
      mapsUrl: c.mapsUrl,
      whyRecommended: c.whyRecommended,
      createdAt: now,
    });
  }

  // Pre-seed Ethan's ballot
  if (candidates1.length >= 2) {
    const ethanBallotId = "ballot_ethan_01";
    await db.insert(schema.ballots).values({
      id: ethanBallotId,
      planId: planVotingId,
      runId: run1Id,
      userId: "user_ethan",
      updatedAt: now,
    });
    await db.insert(schema.ballotSelections).values([
      { id: "bs_1", ballotId: ethanBallotId, candidateId: candidates1[0].id },
      { id: "bs_2", ballotId: ethanBallotId, candidateId: candidates1[1].id },
    ]);
  }

  // 6. Seed Plan 2: Confirmed Plan (Maya + Ethan + Clara)
  const planConfirmedId = "plan_trio_celebration";
  await db.insert(schema.plans).values({
    id: planConfirmedId,
    organizerId: "user_maya",
    state: "confirmed",
    version: 5,
    date: "2026-08-28",
    windowStart: "19:00",
    windowEnd: "21:00",
    mealType: "dinner",
    groupBudgetCents: 16000,
    alcoholMode: "excluded",
    fairnessMode: "equal_journeys",
    timezone: "Asia/Singapore",
    shortlistSize: 4,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.planParticipants).values([
    {
      id: "part_conf_maya",
      planId: planConfirmedId,
      userId: "user_maya",
      role: "organizer",
      coarseOriginLabel: "Novena / Balestier",
      isReady: 1,
      acknowledgedState: "acknowledged",
      joinedAt: now,
    },
    {
      id: "part_conf_ethan",
      planId: planConfirmedId,
      userId: "user_ethan",
      role: "member",
      coarseOriginLabel: "Jurong East",
      isReady: 1,
      acknowledgedState: "acknowledged",
      joinedAt: now,
    },
    {
      id: "part_conf_clara",
      planId: planConfirmedId,
      userId: "user_clara",
      role: "member",
      coarseOriginLabel: "Tampines",
      isReady: 1,
      acknowledgedState: "pending",
      joinedAt: now,
    },
  ]);
  await saveParticipantLocation(
    { participantId: "part_conf_maya", userId: "user_maya", planId: planConfirmedId },
    { postalCode: "307683", lat: 1.3204, lng: 103.8436 },
  );
  await saveParticipantLocation(
    { participantId: "part_conf_ethan", userId: "user_ethan", planId: planConfirmedId },
    { postalCode: "609731", lat: 1.3329, lng: 103.7436 },
  );
  await saveParticipantLocation(
    { participantId: "part_conf_clara", userId: "user_clara", planId: planConfirmedId },
    { postalCode: "529538", lat: 1.3533, lng: 103.9452 },
  );

  const run2Id = "run_demo_02";
  await db.insert(schema.recommendationRuns).values({
    id: run2Id,
    planId: planConfirmedId,
    planVersion: 4,
    algorithmVersion: "v1.0",
    status: "completed",
    createdAt: now,
  });

  const candidates2 = generateRecommendations({
    runId: run2Id,
    planId: planConfirmedId,
    participants: [
      {
        participantId: "part_conf_maya",
        userId: "user_maya",
        displayName: "Maya Chen",
        coarseOriginLabel: "Novena",
        lat: 1.3204,
        lng: 103.8436,
        dietaryRules: [],
        cuisinePreferences: [{ id: "1", userId: "user_maya", cuisineCode: "italian", weight: 2 }],
      },
      {
        participantId: "part_conf_ethan",
        userId: "user_ethan",
        displayName: "Ethan Tan",
        coarseOriginLabel: "Jurong East",
        lat: 1.3329,
        lng: 103.7436,
        dietaryRules: [],
        cuisinePreferences: [{ id: "2", userId: "user_ethan", cuisineCode: "italian", weight: 1 }],
      },
      {
        participantId: "part_conf_clara",
        userId: "user_clara",
        displayName: "Clara Lee",
        coarseOriginLabel: "Tampines",
        lat: 1.3533,
        lng: 103.9452,
        dietaryRules: [{ id: "3", userId: "user_clara", ruleCode: "halal", severity: "hard", createdAt: now }],
        cuisinePreferences: [{ id: "4", userId: "user_clara", cuisineCode: "halal", weight: 2 }],
      },
    ],
    mealType: "dinner",
    groupBudgetCents: 16000,
    alcoholMode: "excluded",
    fairnessMode: "equal_journeys",
    shortlistSize: 4,
  });

  for (const c of candidates2) {
    await db.insert(schema.recommendationCandidates).values({
      id: c.id,
      runId: c.runId,
      rank: c.rank,
      venueId: c.venueId,
      name: c.name,
      address: c.address,
      coarseArea: c.coarseArea,
      lat: c.lat,
      lng: c.lng,
      cuisine: c.cuisine,
      priceTier: c.priceTier,
      priceRangeMinCents: c.priceRangeMinCents,
      priceRangeMaxCents: c.priceRangeMaxCents,
      rating: c.rating,
      ratingCount: c.ratingCount,
      badgesJson: JSON.stringify(c.badges),
      transitEstimatesJson: JSON.stringify(c.transitEstimates),
      dietarySuitabilityJson: JSON.stringify(c.dietarySuitability),
      bookingUrl: c.bookingUrl,
      mapsUrl: c.mapsUrl,
      whyRecommended: c.whyRecommended,
      createdAt: now,
    });
  }

  // Set Decision: Tipo Pasta Bar at 19:30
  if (candidates2.length > 0) {
    const winningCandidate = candidates2[0];
    await db.insert(schema.planDecisions).values({
      id: "dec_demo_01",
      planId: planConfirmedId,
      candidateId: winningCandidate.id,
      exactStartTime: "19:30",
      decisionKind: "winner",
      decidedBy: "user_maya",
      createdAt: now,
    });
  }

  console.log("✅ Seed completed successfully!");
}

// Allow direct execution
if (process.argv[1]?.includes("seed")) {
  seedDatabase().then(() => process.exit(0)).catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
