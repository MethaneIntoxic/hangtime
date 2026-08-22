import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { generateIcsCalendarFile } from "@/domain/ics/generator";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePlanMember } from "@/lib/auth/plan-access";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Not signed in", { status: 401 });
  }
  const access = await requirePlanMember(planId, user.id);
  if (!access.ok) {
    return new NextResponse(access.message, { status: access.status });
  }
  const plan = access.plan;

  const decision = await db
    .select()
    .from(schema.planDecisions)
    .where(eq(schema.planDecisions.planId, planId))
    .get();

  if (!decision) {
    return new NextResponse("Plan is not yet confirmed", { status: 400 });
  }

  const candidate = await db
    .select()
    .from(schema.recommendationCandidates)
    .where(eq(schema.recommendationCandidates.id, decision.candidateId))
    .get();

  const organizer = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.id, plan.organizerId))
    .get();

  const icsContent = generateIcsCalendarFile({
    planId: plan.id,
    venueName: candidate?.name || "Hangtime venue",
    venueAddress: candidate?.address || "Singapore",
    date: plan.date,
    startTime: decision.exactStartTime || plan.windowStart,
    mealType: plan.mealType,
    organizerName: organizer?.displayName || "Organizer",
    mapsUrl: candidate?.mapsUrl,
    bookingUrl: candidate?.bookingUrl,
  });

  return new NextResponse(icsContent, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="hangtime-${plan.date}.ics"`,
    },
  });
}
