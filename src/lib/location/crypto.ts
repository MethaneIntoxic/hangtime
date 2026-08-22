import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { getLocationKey, type LocationKeyring } from "./keyring";
import {
  LOCATION_PAYLOAD_VERSION,
  LocationSecurityError,
  assertLocationSubject,
  normalizePreciseLocation,
  parseLocationPayload,
  type EncryptedLocationEnvelope,
  type LocationPayloadV1,
  type LocationSubject,
  type PreciseLocation,
} from "./types";

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export function locationAssociatedData(subject: LocationSubject): Buffer {
  assertLocationSubject(subject);
  return Buffer.from(
    `hangtime:location:v1:${subject.kind}:${subject.subjectId}:${subject.ownerUserId}:${subject.planId ?? ""}`,
    "utf8",
  );
}

export function encryptLocation(
  location: PreciseLocation,
  subject: LocationSubject,
  keyring: LocationKeyring,
): EncryptedLocationEnvelope {
  const normalized = normalizePreciseLocation(location);
  const payload: LocationPayloadV1 = {
    v: LOCATION_PAYLOAD_VERSION,
    postalCode: normalized.postalCode,
    lat: normalized.lat,
    lng: normalized.lng,
  };
  const nonce = randomBytes(NONCE_BYTES);
  const key = getLocationKey(keyring, keyring.activeVersion);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(locationAssociatedData(subject));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext,
    nonce,
    authTag: cipher.getAuthTag(),
    keyVersion: keyring.activeVersion,
    payloadVersion: LOCATION_PAYLOAD_VERSION,
  };
}

export function decryptLocation(
  envelope: EncryptedLocationEnvelope,
  subject: LocationSubject,
  keyring: LocationKeyring,
): PreciseLocation {
  if (
    envelope.payloadVersion !== LOCATION_PAYLOAD_VERSION ||
    envelope.nonce.length !== NONCE_BYTES ||
    envelope.authTag.length !== AUTH_TAG_BYTES ||
    envelope.ciphertext.length === 0
  ) {
    throw new LocationSecurityError(
      "LOCATION_DECRYPTION_FAILED",
      "The encrypted location envelope is invalid.",
    );
  }

  try {
    const key = getLocationKey(keyring, envelope.keyVersion);
    const decipher = createDecipheriv(ALGORITHM, key, envelope.nonce, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(locationAssociatedData(subject));
    decipher.setAuthTag(envelope.authTag);
    const plaintext = Buffer.concat([
      decipher.update(envelope.ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const payload = parseLocationPayload(JSON.parse(plaintext) as unknown);
    return { postalCode: payload.postalCode, lat: payload.lat, lng: payload.lng };
  } catch (error) {
    if (
      error instanceof LocationSecurityError &&
      error.code === "LOCATION_KEY_UNAVAILABLE"
    ) {
      throw error;
    }
    throw new LocationSecurityError(
      "LOCATION_DECRYPTION_FAILED",
      "The encrypted location could not be authenticated.",
      { cause: error },
    );
  }
}
