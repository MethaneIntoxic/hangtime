export const LOCATION_PAYLOAD_VERSION = 1 as const;

export type LocationSubjectKind = "profile" | "plan_participant";

export interface LocationSubject {
  kind: LocationSubjectKind;
  subjectId: string;
  ownerUserId: string;
  planId: string | null;
}

export interface PreciseLocation {
  postalCode: string | null;
  lat: number;
  lng: number;
}

export interface LocationPayloadV1 extends PreciseLocation {
  v: typeof LOCATION_PAYLOAD_VERSION;
}

export interface EncryptedLocationEnvelope {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: string;
  payloadVersion: typeof LOCATION_PAYLOAD_VERSION;
}

export interface StoredPrivateLocation extends EncryptedLocationEnvelope {
  id: string;
  subject: LocationSubject;
  createdAt: string;
  updatedAt: string;
}

export type LocationErrorCode =
  | "LOCATION_CONFIGURATION_INVALID"
  | "LOCATION_INPUT_INVALID"
  | "LOCATION_KEY_UNAVAILABLE"
  | "LOCATION_DECRYPTION_FAILED";

export class LocationSecurityError extends Error {
  constructor(
    readonly code: LocationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LocationSecurityError";
  }
}

const SUBJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SINGAPORE_LATITUDE = { min: 1.13, max: 1.48 } as const;
const SINGAPORE_LONGITUDE = { min: 103.6, max: 104.1 } as const;

function assertIdentifier(value: string, field: string): void {
  if (!SUBJECT_ID_PATTERN.test(value)) {
    throw new LocationSecurityError(
      "LOCATION_INPUT_INVALID",
      `${field} is not a valid location subject identifier.`,
    );
  }
}

export function assertLocationSubject(subject: LocationSubject): void {
  assertIdentifier(subject.subjectId, "subjectId");
  assertIdentifier(subject.ownerUserId, "ownerUserId");
  if (subject.kind === "profile" && subject.planId !== null) {
    throw new LocationSecurityError(
      "LOCATION_INPUT_INVALID",
      "Profile locations cannot be associated with a plan.",
    );
  }
  if (subject.kind === "plan_participant") {
    if (subject.planId === null) {
      throw new LocationSecurityError(
        "LOCATION_INPUT_INVALID",
        "Plan participant locations require a plan identifier.",
      );
    }
    assertIdentifier(subject.planId, "planId");
  }
}

export function normalizePreciseLocation(input: PreciseLocation): PreciseLocation {
  const postalCode = input.postalCode?.trim() || null;
  if (postalCode !== null && !/^\d{6}$/.test(postalCode)) {
    throw new LocationSecurityError(
      "LOCATION_INPUT_INVALID",
      "Singapore postal codes must contain exactly six digits.",
    );
  }
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    throw new LocationSecurityError(
      "LOCATION_INPUT_INVALID",
      "Location coordinates must be finite numbers.",
    );
  }
  if (
    input.lat < SINGAPORE_LATITUDE.min ||
    input.lat > SINGAPORE_LATITUDE.max ||
    input.lng < SINGAPORE_LONGITUDE.min ||
    input.lng > SINGAPORE_LONGITUDE.max
  ) {
    throw new LocationSecurityError(
      "LOCATION_INPUT_INVALID",
      "Location coordinates are outside the supported Singapore service area.",
    );
  }

  return { postalCode, lat: input.lat, lng: input.lng };
}

export function parseLocationPayload(value: unknown): LocationPayloadV1 {
  if (!value || typeof value !== "object") {
    throw new LocationSecurityError(
      "LOCATION_DECRYPTION_FAILED",
      "The encrypted location payload is invalid.",
    );
  }
  const candidate = value as Partial<LocationPayloadV1>;
  if (candidate.v !== LOCATION_PAYLOAD_VERSION) {
    throw new LocationSecurityError(
      "LOCATION_DECRYPTION_FAILED",
      "The encrypted location payload version is unsupported.",
    );
  }
  try {
    return {
      v: LOCATION_PAYLOAD_VERSION,
      ...normalizePreciseLocation({
        postalCode: candidate.postalCode ?? null,
        lat: candidate.lat as number,
        lng: candidate.lng as number,
      }),
    };
  } catch (error) {
    throw new LocationSecurityError(
      "LOCATION_DECRYPTION_FAILED",
      "The encrypted location payload is invalid.",
      { cause: error },
    );
  }
}
