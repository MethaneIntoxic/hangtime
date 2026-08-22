import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type RequiredPlanRole = "member" | "organizer";

export interface PlanAccessDecisionInput {
  userId: string;
  organizerId: string;
  participantUserIds: readonly string[];
}

export function decidePlanAccess(
  input: PlanAccessDecisionInput,
  requiredRole: RequiredPlanRole
): boolean {
  if (requiredRole === "organizer") {
    return input.userId === input.organizerId;
  }
  return (
    input.userId === input.organizerId ||
    input.participantUserIds.includes(input.userId)
  );
}

type PlanRow = typeof schema.plans.$inferSelect;
type ParticipantRow = typeof schema.planParticipants.$inferSelect;

export type PlanAccessResult =
  | {
      ok: true;
      plan: PlanRow;
      participant: ParticipantRow | null;
      isOrganizer: boolean;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "FORBIDDEN";
      message: string;
      status: 403 | 404;
    };

async function loadPlanAccess(
  planId: string,
  userId: string,
  requiredRole: RequiredPlanRole
): Promise<PlanAccessResult> {
  const plan = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.id, planId))
    .get();
  if (!plan) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Plan not found",
      status: 404,
    };
  }

  const participant = await db
    .select()
    .from(schema.planParticipants)
    .where(
      and(
        eq(schema.planParticipants.planId, planId),
        eq(schema.planParticipants.userId, userId)
      )
    )
    .get();
  const isOrganizer = plan.organizerId === userId;
  const allowed = decidePlanAccess(
    {
      userId,
      organizerId: plan.organizerId,
      participantUserIds: participant ? [participant.userId] : [],
    },
    requiredRole
  );
  if (!allowed) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message:
        requiredRole === "organizer"
          ? "Only the organizer can perform this action."
          : "You are not a participant in this plan.",
      status: 403,
    };
  }

  return { ok: true, plan, participant: participant ?? null, isOrganizer };
}

export function requirePlanMember(
  planId: string,
  userId: string
): Promise<PlanAccessResult> {
  return loadPlanAccess(planId, userId, "member");
}

export function requirePlanOrganizer(
  planId: string,
  userId: string
): Promise<PlanAccessResult> {
  return loadPlanAccess(planId, userId, "organizer");
}

export function stripPrivateLocationFields<
  T extends object,
>(record: T): Omit<T, "postalCode" | "lat" | "lng"> {
  const safeRecord = { ...record } as Record<string, unknown>;
  delete safeRecord.postalCode;
  delete safeRecord.lat;
  delete safeRecord.lng;
  return safeRecord as Omit<T, "postalCode" | "lat" | "lng">;
}
