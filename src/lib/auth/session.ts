import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { UserProfile, AccountKind } from "@/types";
import {
  DEFAULT_DEMO_USER_ID,
  DEMO_SESSION_COOKIE_NAME,
  getDemoSessionSecret,
  isDevelopmentDemoMode,
  verifyDemoSessionToken,
} from "./demo-session";
import {
  productionSessionUserId,
  sessionCookieName,
} from "./production-session";

export async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const productionToken = cookieStore.get(sessionCookieName())?.value;
  if (productionToken) {
    const productionUserId = await productionSessionUserId(productionToken);
    if (productionUserId) return productionUserId;
  }

  if (isDevelopmentDemoMode()) {
    const demoToken = cookieStore.get(DEMO_SESSION_COOKIE_NAME)?.value;
    const secret = getDemoSessionSecret();
    if (demoToken && secret) {
      return verifyDemoSessionToken(demoToken, secret);
    }
    if (!demoToken) return DEFAULT_DEMO_USER_ID;
  }
  return null;
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const user = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId))
    .get();

  if (!user) return null;

  return {
    ...user,
    accountKind: user.accountKind as AccountKind,
    coarseArea: user.coarseArea || "Novena / Balestier (Central)",
    notificationPrefs: JSON.parse(user.notificationPrefs || '{"email":true,"push":false}'),
  };
}

export async function getUserById(userId: string): Promise<UserProfile | null> {
  const user = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId))
    .get();

  if (!user) return null;
  return {
    ...user,
    accountKind: user.accountKind as AccountKind,
    coarseArea: user.coarseArea || "Novena / Balestier (Central)",
    notificationPrefs: JSON.parse(user.notificationPrefs || '{"email":true,"push":false}'),
  };
}
