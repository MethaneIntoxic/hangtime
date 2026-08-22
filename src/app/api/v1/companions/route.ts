import { getCurrentUser } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";
import { generateId } from "@/lib/auth/crypto";
import { z } from "zod";

const createCompanionSchema = z.object({
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().min(1).max(80).optional(),
}).strict();

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  const companionships = await db
    .select()
    .from(schema.diningCompanions)
    .where(eq(schema.diningCompanions.ownerUserId, user.id));

  const list = [];
  for (const c of companionships) {
    const compProfile = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, c.companionUserId))
      .get();
    if (compProfile) {
      list.push({
        id: c.id,
        companionId: c.companionUserId,
        displayName: compProfile.displayName,
        email: compProfile.email,
        coarseArea: compProfile.coarseArea,
        avatarPath: compProfile.avatarPath,
        isFavourite: Boolean(c.isFavourite),
        status: c.status,
      });
    }
  }

  return apiSuccess({ companions: list });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Not signed in", 401);

  try {
    const parsed = createCompanionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError("INVALID_INPUT", "Enter a valid companion email.", 400);
    }
    const email = parsed.data.email.toLowerCase();
    const displayName = parsed.data.displayName;
    if (email === user.email.toLowerCase()) {
      return apiError("INVALID_INPUT", "You cannot add yourself as a companion.", 400);
    }

    const now = new Date().toISOString();
    // Check if profile exists with this email
    let compUser = await db
      .select()
      .from(schema.profiles)
      .where(sql`lower(trim(${schema.profiles.email})) = ${email}`)
      .get();

    if (!compUser) {
      const newId = generateId("user");
      compUser = {
        id: newId,
        email,
        displayName: displayName || email.split("@")[0],
        avatarPath: `https://api.dicebear.com/7.x/notionists/svg?seed=${displayName || email}`,
        accountKind: "guest",
        timezone: "Asia/Singapore",
        coarseArea: null,
        notificationPrefs: JSON.stringify({ email: true, push: false }),
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.profiles).values(compUser);
    }

    const existing = await db
      .select({ id: schema.diningCompanions.id })
      .from(schema.diningCompanions)
      .where(and(
        eq(schema.diningCompanions.ownerUserId, user.id),
        eq(schema.diningCompanions.companionUserId, compUser.id),
      ))
      .get();
    if (existing) {
      return apiError("ALREADY_INVITED", "This companion has already been invited.", 409);
    }

    // Consent is one-way and pending until the invited person accepts.
    const companionId = generateId("dc");
    await db.insert(schema.diningCompanions).values({
      id: companionId,
      ownerUserId: user.id,
      companionUserId: compUser.id,
      status: "pending",
      isFavourite: 0,
      createdAt: now,
    });

    return apiSuccess({
      companion: {
        id: companionId,
        companionId: compUser.id,
        displayName: compUser.displayName,
        email: compUser.email,
        coarseArea: compUser.coarseArea,
        status: "pending",
      },
    });
  } catch (err: unknown) {
    return apiError("SERVER_ERROR", (err as Error).message, 500);
  }
}
