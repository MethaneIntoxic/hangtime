import { client } from "@/lib/db";
import { SINGAPORE_PLANNING_AREAS } from "@/providers/singapore-transit";
import { getLocationKeyring } from "./keyring";
import { PrivateLocationRepository, type LocationExecutor } from "./repository";
import type { LocationSubject, PreciseLocation } from "./types";

export function privateLocationRepository(executor: LocationExecutor = client): PrivateLocationRepository {
  return new PrivateLocationRepository(executor, getLocationKeyring());
}

export function profileLocationSubject(userId: string): LocationSubject {
  return { kind: "profile", subjectId: userId, ownerUserId: userId, planId: null };
}

export function participantLocationSubject(input: {
  participantId: string;
  userId: string;
  planId: string;
}): LocationSubject {
  return {
    kind: "plan_participant",
    subjectId: input.participantId,
    ownerUserId: input.userId,
    planId: input.planId,
  };
}

export function planningAreaLocation(label: string | null | undefined): PreciseLocation | null {
  if (!label) return null;
  const area = SINGAPORE_PLANNING_AREAS.find((candidate) => candidate.label === label);
  if (!area) return null;
  return { postalCode: area.postalCode, lat: area.lat, lng: area.lng };
}

export async function savedProfileLocation(userId: string): Promise<PreciseLocation | null> {
  return privateLocationRepository().get(profileLocationSubject(userId));
}

export async function saveProfileLocation(userId: string, location: PreciseLocation): Promise<void> {
  await privateLocationRepository().put(profileLocationSubject(userId), location);
}

export async function savedParticipantLocation(input: {
  participantId: string;
  userId: string;
  planId: string;
}): Promise<PreciseLocation | null> {
  return privateLocationRepository().get(participantLocationSubject(input));
}

export async function saveParticipantLocation(
  input: { participantId: string; userId: string; planId: string },
  location: PreciseLocation,
): Promise<void> {
  await privateLocationRepository().put(participantLocationSubject(input), location);
}
