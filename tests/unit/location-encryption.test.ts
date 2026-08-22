import { createClient, type Client } from "@libsql/client";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptLocation, encryptLocation } from "@/lib/location/crypto";
import { parseLocationKeyring, type LocationKeyring } from "@/lib/location/keyring";
import { PrivateLocationRepository } from "@/lib/location/repository";
import { LocationSecurityError, type LocationSubject } from "@/lib/location/types";

function keyring(active = "v1", versions = ["v1"]): LocationKeyring {
  return parseLocationKeyring(
    Buffer.from(JSON.stringify({
      active,
      keys: Object.fromEntries(
        versions.map((version) => [version, randomBytes(32).toString("base64url")]),
      ),
    })).toString("base64url"),
  );
}

const profileSubject: LocationSubject = {
  kind: "profile",
  subjectId: "user_maya",
  ownerUserId: "user_maya",
  planId: null,
};
const location = { postalCode: "307683", lat: 1.3204, lng: 103.8436 };

describe("location encryption", () => {
  it("round-trips an authenticated payload with a random nonce", () => {
    const keys = keyring();
    const first = encryptLocation(location, profileSubject, keys);
    const second = encryptLocation(location, profileSubject, keys);

    expect(decryptLocation(first, profileSubject, keys)).toEqual(location);
    expect(first.nonce).toHaveLength(12);
    expect(first.authTag).toHaveLength(16);
    expect(first.nonce.equals(second.nonce)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
    expect(first.ciphertext.toString("utf8")).not.toContain("307683");
  });

  it("fails closed when ciphertext, tag, or subject binding is changed", () => {
    const keys = keyring();
    const envelope = encryptLocation(location, profileSubject, keys);
    const tamperedCiphertext = Buffer.from(envelope.ciphertext);
    tamperedCiphertext[0] ^= 1;
    const tamperedTag = Buffer.from(envelope.authTag);
    tamperedTag[0] ^= 1;

    expect(() => decryptLocation({ ...envelope, ciphertext: tamperedCiphertext }, profileSubject, keys))
      .toThrowError(LocationSecurityError);
    expect(() => decryptLocation({ ...envelope, authTag: tamperedTag }, profileSubject, keys))
      .toThrowError(LocationSecurityError);
    expect(() => decryptLocation(envelope, profileSubject, keyring()))
      .toThrowError(LocationSecurityError);
    expect(() => decryptLocation(
      envelope,
      { ...profileSubject, subjectId: "user_ethan", ownerUserId: "user_ethan" },
      keys,
    )).toThrowError(LocationSecurityError);
  });

  it("rejects malformed keyrings and out-of-service-area coordinates", () => {
    const malformed = Buffer.from(JSON.stringify({
      active: "v1",
      keys: { v1: randomBytes(16).toString("base64url") },
    })).toString("base64url");
    expect(() => parseLocationKeyring(malformed)).toThrowError(LocationSecurityError);

    const keys = keyring();
    expect(() => encryptLocation(
      { postalCode: "307683", lat: 51.5, lng: -0.12 },
      profileSubject,
      keys,
    )).toThrowError(LocationSecurityError);
  });
});

describe("private location repository", () => {
  let sqlite: Client | undefined;
  let directory: string | undefined;

  afterEach(() => {
    sqlite?.close();
    // The libSQL native handle is released when the Vitest worker exits.
    directory = undefined;
  });

  it("stores only an envelope and supports compare-and-swap key rotation", async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "hangtime-location-libsql-"));
    sqlite = createClient({ url: `file:${path.join(directory, "location.db").replaceAll("\\", "/")}` });
    await sqlite.executeMultiple(`
      CREATE TABLE private_locations (
        id TEXT PRIMARY KEY,
        subject_kind TEXT NOT NULL,
        subject_id TEXT NOT NULL UNIQUE,
        owner_user_id TEXT NOT NULL,
        plan_id TEXT,
        ciphertext BLOB NOT NULL,
        nonce BLOB NOT NULL CHECK (length(nonce) = 12),
        auth_tag BLOB NOT NULL CHECK (length(auth_tag) = 16),
        key_version TEXT NOT NULL,
        payload_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const v1 = keyring("v1", ["v1"]);
    const v2Key = randomBytes(32).toString("base64url");
    const v2 = parseLocationKeyring(Buffer.from(JSON.stringify({
      active: "v2",
      keys: {
        v1: v1.keys.get("v1")!.toString("base64url"),
        v2: v2Key,
      },
    })).toString("base64url"));
    const repository = new PrivateLocationRepository(sqlite, v1);
    await repository.put(profileSubject, location);

    const raw = (await sqlite.execute("SELECT * FROM private_locations")).rows[0];
    expect(raw).not.toHaveProperty("postal_code");
    expect(raw).not.toHaveProperty("lat");
    expect(raw).not.toHaveProperty("lng");
    expect(await repository.get(profileSubject)).toEqual(location);

    const stored = (await repository.listEncryptedByKeyVersion("v1"))[0];
    expect(await repository.rotate(stored, v2)).toBe(true);
    expect(await repository.rotate(stored, v2)).toBe(false);
    expect(await new PrivateLocationRepository(sqlite, v2).get(profileSubject)).toEqual(location);
    expect(await repository.listEncryptedByKeyVersion("v1")).toHaveLength(0);

    await expect(repository.put(
      { ...profileSubject, ownerUserId: "user_attacker" },
      location,
    )).rejects.toThrowError(LocationSecurityError);
    expect(await new PrivateLocationRepository(sqlite, v2).get(profileSubject)).toEqual(location);
  });
});
