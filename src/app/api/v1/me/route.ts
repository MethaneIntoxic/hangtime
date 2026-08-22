import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { stripPrivateLocationFields } from "@/lib/auth/plan-access";
import { isDevelopmentDemoMode } from "@/lib/auth/demo-session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("UNAUTHORIZED", "Not signed in", 401);
  }

  // Fetch dietary rules
  const dietaryRules = await db
    .select()
    .from(schema.dietaryRules)
    .where(eq(schema.dietaryRules.userId, user.id));

  // Fetch cuisine preferences
  const cuisinePreferences = await db
    .select()
    .from(schema.cuisinePreferences)
    .where(eq(schema.cuisinePreferences.userId, user.id));

  // Fetch dining companions
  const companionships = await db
    .select()
    .from(schema.diningCompanions)
    .where(eq(schema.diningCompanions.ownerUserId, user.id));

  const companionProfiles = [];
  for (const c of companionships) {
    const compUser = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, c.companionUserId))
      .get();
    if (compUser) {
      companionProfiles.push({
        id: c.id,
        ownerUserId: c.ownerUserId,
        companionUserId: c.companionUserId,
        status: c.status,
        isFavourite: Boolean(c.isFavourite),
        companionProfile: stripPrivateLocationFields({
          ...compUser,
          notificationPrefs: JSON.parse(compUser.notificationPrefs || "{}"),
        }),
        createdAt: c.createdAt,
      });
    }
  }

  return apiSuccess({
    profile: user,
    demoMode: isDevelopmentDemoMode(),
    dietaryRules,
    cuisinePreferences,
    companions: companionProfiles,
  });
}
