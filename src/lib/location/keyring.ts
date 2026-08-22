import { LocationSecurityError } from "./types";

export interface LocationKeyring {
  activeVersion: string;
  keys: ReadonlyMap<string, Buffer>;
}

interface SerializedKeyring {
  active: unknown;
  keys: unknown;
}

const KEY_VERSION_PATTERN = /^v[1-9]\d{0,8}$/;

function decodeBase64UrlStrict(value: string, label: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new LocationSecurityError(
      "LOCATION_CONFIGURATION_INVALID",
      `${label} must be unpadded base64url.`,
    );
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new LocationSecurityError(
      "LOCATION_CONFIGURATION_INVALID",
      `${label} is not canonical base64url.`,
    );
  }
  return decoded;
}

export function parseLocationKeyring(encoded: string): LocationKeyring {
  let parsed: SerializedKeyring;
  try {
    const bytes = decodeBase64UrlStrict(encoded, "LOCATION_KEYRING_B64");
    parsed = JSON.parse(bytes.toString("utf8")) as SerializedKeyring;
  } catch (error) {
    if (error instanceof LocationSecurityError) throw error;
    throw new LocationSecurityError(
      "LOCATION_CONFIGURATION_INVALID",
      "LOCATION_KEYRING_B64 is not valid base64url-encoded JSON.",
      { cause: error },
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LocationSecurityError(
      "LOCATION_CONFIGURATION_INVALID",
      "The location keyring must be a JSON object.",
    );
  }
  const ownKeys = Object.keys(parsed).sort();
  if (ownKeys.join(",") !== "active,keys") {
    throw new LocationSecurityError(
      "LOCATION_CONFIGURATION_INVALID",
      "The location keyring contains unsupported fields.",
    );
  }
  if (typeof parsed.active !== "string" || !KEY_VERSION_PATTERN.test(parsed.active)) {
    throw new LocationSecurityError(
      "LOCATION_CONFIGURATION_INVALID",
      "The active location key version is invalid.",
    );
  }
  if (!parsed.keys || typeof parsed.keys !== "object" || Array.isArray(parsed.keys)) {
    throw new LocationSecurityError(
      "LOCATION_CONFIGURATION_INVALID",
      "The location keyring keys field must be an object.",
    );
  }

  const entries = Object.entries(parsed.keys as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 8) {
    throw new LocationSecurityError(
      "LOCATION_CONFIGURATION_INVALID",
      "The location keyring must contain between one and eight keys.",
    );
  }
  const keys = new Map<string, Buffer>();
  for (const [version, encodedKey] of entries) {
    if (!KEY_VERSION_PATTERN.test(version) || typeof encodedKey !== "string") {
      throw new LocationSecurityError(
        "LOCATION_CONFIGURATION_INVALID",
        "The location keyring contains an invalid key entry.",
      );
    }
    const key = decodeBase64UrlStrict(encodedKey, `location key ${version}`);
    if (key.length !== 32) {
      throw new LocationSecurityError(
        "LOCATION_CONFIGURATION_INVALID",
        `Location key ${version} must decode to exactly 32 bytes.`,
      );
    }
    keys.set(version, key);
  }
  if (!keys.has(parsed.active)) {
    throw new LocationSecurityError(
      "LOCATION_CONFIGURATION_INVALID",
      "The active location key is missing from the keyring.",
    );
  }
  return { activeVersion: parsed.active, keys };
}

let cachedKeyring: LocationKeyring | undefined;
let cachedSource: string | undefined;

export function getLocationKeyring(): LocationKeyring {
  const source = process.env.LOCATION_KEYRING_B64?.trim();
  if (!source) {
    if (process.env.NODE_ENV !== "production") {
      return {
        activeVersion: "v1",
        keys: new Map([["v1", Buffer.from("hangtime-local-location-key-v1!!", "utf8")]]),
      };
    }
    throw new LocationSecurityError(
      "LOCATION_KEY_UNAVAILABLE",
      "Location encryption is not configured.",
    );
  }
  if (!cachedKeyring || cachedSource !== source) {
    cachedKeyring = parseLocationKeyring(source);
    cachedSource = source;
  }
  return cachedKeyring;
}

export function getLocationKey(keyring: LocationKeyring, version: string): Buffer {
  const key = keyring.keys.get(version);
  if (!key) {
    throw new LocationSecurityError(
      "LOCATION_KEY_UNAVAILABLE",
      "The required location encryption key is unavailable.",
    );
  }
  return key;
}

export function clearLocationKeyringCacheForTests(): void {
  cachedKeyring = undefined;
  cachedSource = undefined;
}
