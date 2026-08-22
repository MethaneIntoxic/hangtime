import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { generateId } from "@/lib/auth/crypto";
import { planningAreaLocation, saveProfileLocation } from "@/lib/location/service";
import { z } from "zod";

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  coarseArea: z.string().trim().min(1).max(120).optional(),
  dietaryRules: z.array(z.object({
    ruleCode: z.string().trim().min(1).max(80),
    severity: z.enum(["allergy", "hard", "preference"]).default("preference"),
    note: z.string().trim().max(500).optional(),
  }).strict()).max(25).optional(),
  cuisinePreferences: z.array(z.object({
    cuisineCode: z.string().trim().min(1).max(80),
    weight: z.number().int().min(-2).max(2).default(0),
  }).strict()).max(50).optional(),
}).strict();

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("UNAUTHORIZED", "Not signed in", 401);
  }

  try {
    const parsed = updateProfileSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError("INVALID_INPUT", "Check the profile details and try again.", 400);
    }
    const { displayName, coarseArea, dietaryRules, cuisinePreferences } = parsed.data;

    if (coarseArea !== undefined) {
      const preciseLocation = planningAreaLocation(coarseArea);
      if (!preciseLocation) {
        return apiError("INVALID_LOCATION", "Choose a supported Singapore planning area.", 400);
      }
      await saveProfileLocation(user.id, preciseLocation);
    }

    const now = new Date().toISOString();

    // Update profile
    await db
      .update(schema.profiles)
      .set({
        displayName: displayName || user.displayName,
        coarseArea: coarseArea !== undefined ? coarseArea : user.coarseArea,
        updatedAt: now,
      })
      .where(eq(schema.profiles.id, user.id));

    // Replace dietary rules if provided
    if (Array.isArray(dietaryRules)) {
      await db
        .delete(schema.dietaryRules)
        .where(eq(schema.dietaryRules.userId, user.id));

      if (dietaryRules.length > 0) {
        await db.insert(schema.dietaryRules).values(
          dietaryRules.map((r) => ({
            id: generateId("diet"),
            userId: user.id,
            ruleCode: r.ruleCode,
            severity: (r.severity as "allergy" | "hard" | "preference") || "preference",
            note: r.note || null,
            createdAt: now,
          }))
        );
      }
    }

    // Replace cuisine preferences if provided
    if (Array.isArray(cuisinePreferences)) {
      await db
        .delete(schema.cuisinePreferences)
        .where(eq(schema.cuisinePreferences.userId, user.id));

      if (cuisinePreferences.length > 0) {
        await db.insert(schema.cuisinePreferences).values(
          cuisinePreferences.map((cp) => ({
            id: generateId("cp"),
            userId: user.id,
            cuisineCode: cp.cuisineCode,
            weight: typeof cp.weight === "number" ? cp.weight : 0,
          }))
        );
      }
    }

    return apiSuccess({ success: true });
  } catch (err: unknown) {
    return apiError("BAD_REQUEST", (err as Error).message, 400);
  }
}
