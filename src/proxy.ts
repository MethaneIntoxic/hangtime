import { NextRequest, NextResponse } from "next/server";
import {
  DEVELOPMENT_SESSION_COOKIE_NAME,
  PRODUCTION_SESSION_COOKIE_NAME,
  DEMO_SESSION_COOKIE_NAME,
} from "@/lib/auth/cookie-names";

export function proxy(request: NextRequest) {
  // Local development retains the explicit demo fallback implemented by the
  // session layer. Production never permits an anonymous application shell.
  const developmentRequest = process.env.NODE_ENV !== "production";
  const unsafeApiRequest =
    request.nextUrl.pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method);

  if (!developmentRequest && unsafeApiRequest) {
    const origin = request.headers.get("origin");
    let expectedOrigin: string | null = null;
    try {
      expectedOrigin = new URL(process.env.APP_URL ?? "").origin;
    } catch {
      // A malformed/missing production APP_URL must fail closed here as well
      // as in the startup environment validator.
    }
    if (!origin || origin !== expectedOrigin) {
      return NextResponse.json(
        { error: { code: "INVALID_ORIGIN", message: "Request origin is not allowed." } },
        { status: 403 },
      );
    }
  }

  // API routes own their authentication responses and must return JSON 401/403
  // rather than being redirected to the HTML sign-in page.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const hasSession =
    request.cookies.has(PRODUCTION_SESSION_COOKIE_NAME) ||
    request.cookies.has(DEVELOPMENT_SESSION_COOKIE_NAME) ||
    request.cookies.has(DEMO_SESSION_COOKIE_NAME);

  if (developmentRequest || hasSession) return NextResponse.next();

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/", "/companions", "/profile", "/plans/:path*", "/api/:path*"],
};
