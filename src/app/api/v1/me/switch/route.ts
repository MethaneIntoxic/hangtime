import { cookies } from "next/headers";
import { apiSuccess, apiError } from "@/lib/api-response";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  createDemoSessionToken,
  DEMO_SESSION_COOKIE_NAME,
  getDemoSessionSecret,
  isDevelopmentDemoMode,
} from "@/lib/auth/demo-session";

export async function POST(req: Request) {
  if (!isDevelopmentDemoMode()) {
    return apiError("NOT_FOUND", "Not found", 404);
  }

  try {
    const { userId } = await req.json();
    if (!userId) {
      return apiError("INVALID_INPUT", "userId is required", 400);
    }

    const user = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, userId))
      .get();

    if (!user) {
      return apiError("NOT_FOUND", "User not found", 404);
    }

    const secret = getDemoSessionSecret();
    if (!secret) {
      return apiError(
        "DEMO_SESSION_NOT_CONFIGURED",
        "The local demo session is not configured.",
        503
      );
    }

    const token = createDemoSessionToken(user.id, secret);
    const cookieStore = await cookies();
    cookieStore.set(DEMO_SESSION_COOKIE_NAME, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return apiSuccess({
      switchedTo: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        coarseArea: user.coarseArea,
      },
    });
  } catch (err: unknown) {
    return apiError("SERVER_ERROR", (err as Error).message, 500);
  }
}
