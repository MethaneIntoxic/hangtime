import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { client } = await import("@/lib/db");
    await client.execute("SELECT 1");

    return NextResponse.json(
      {
        status: "ok",
        service: "hangtime",
        revision: process.env.APP_REVISION ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
        imageDigest: process.env.RELEASE_IMAGE_DIGEST ?? (process.env.VERCEL ? "vercel" : "local"),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", service: "hangtime" },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
