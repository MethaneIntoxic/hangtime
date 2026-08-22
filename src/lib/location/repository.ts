import type { Client, Row } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { decryptLocation, encryptLocation } from "./crypto";
import type { LocationKeyring } from "./keyring";
import {
  LOCATION_PAYLOAD_VERSION,
  LocationSecurityError,
  assertLocationSubject,
  type EncryptedLocationEnvelope,
  type LocationSubject,
  type PreciseLocation,
  type StoredPrivateLocation,
} from "./types";

interface PrivateLocationRow {
  id: string;
  subjectKind: LocationSubject["kind"];
  subjectId: string;
  ownerUserId: string;
  planId: string | null;
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: string;
  payloadVersion: number;
  createdAt: string;
  updatedAt: string;
}

function toStored(row: PrivateLocationRow): StoredPrivateLocation {
  if (row.payloadVersion !== LOCATION_PAYLOAD_VERSION) {
    throw new LocationSecurityError(
      "LOCATION_DECRYPTION_FAILED",
      "The stored location payload version is unsupported.",
    );
  }
  return {
    id: row.id,
    subject: {
      kind: row.subjectKind,
      subjectId: row.subjectId,
      ownerUserId: row.ownerUserId,
      planId: row.planId,
    },
    ciphertext: Buffer.from(row.ciphertext),
    nonce: Buffer.from(row.nonce),
    authTag: Buffer.from(row.authTag),
    keyVersion: row.keyVersion,
    payloadVersion: row.payloadVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPrivateLocationRow(row: Row): PrivateLocationRow {
  const toBuffer = (value: unknown, column: string): Buffer => {
    if (value instanceof ArrayBuffer) return Buffer.from(value);
    if (value instanceof Uint8Array) return Buffer.from(value);
    throw new LocationSecurityError(
      "LOCATION_DECRYPTION_FAILED",
      `The stored ${column} value is not binary.`,
    );
  };
  return {
    id: String(row.id),
    subjectKind: String(row.subjectKind) as LocationSubject["kind"],
    subjectId: String(row.subjectId),
    ownerUserId: String(row.ownerUserId),
    planId: row.planId === null ? null : String(row.planId),
    ciphertext: toBuffer(row.ciphertext, "ciphertext"),
    nonce: toBuffer(row.nonce, "nonce"),
    authTag: toBuffer(row.authTag, "authentication tag"),
    keyVersion: String(row.keyVersion),
    payloadVersion: Number(row.payloadVersion),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export type LocationExecutor = Pick<Client, "execute">;

export class PrivateLocationRepository {
  constructor(
    private readonly client: LocationExecutor,
    private readonly keyring: LocationKeyring,
  ) {}

  async put(subject: LocationSubject, location: PreciseLocation): Promise<void> {
    assertLocationSubject(subject);
    const envelope = encryptLocation(location, subject, this.keyring);
    const now = new Date().toISOString();
    const result = await this.client.execute({ sql: `
      INSERT INTO private_locations (
        id, subject_kind, subject_id, owner_user_id, plan_id,
        ciphertext, nonce, auth_tag, key_version, payload_version,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(subject_id) DO UPDATE SET
        ciphertext = excluded.ciphertext,
        nonce = excluded.nonce,
        auth_tag = excluded.auth_tag,
        key_version = excluded.key_version,
        payload_version = excluded.payload_version,
        updated_at = excluded.updated_at
      WHERE private_locations.subject_kind = excluded.subject_kind
        AND private_locations.owner_user_id = excluded.owner_user_id
        AND private_locations.plan_id IS excluded.plan_id
    `, args: [
      `loc_${randomUUID()}`,
      subject.kind,
      subject.subjectId,
      subject.ownerUserId,
      subject.planId,
      envelope.ciphertext,
      envelope.nonce,
      envelope.authTag,
      envelope.keyVersion,
      envelope.payloadVersion,
      now,
      now,
    ] });
    if (result.rowsAffected !== 1) {
      throw new LocationSecurityError(
        "LOCATION_INPUT_INVALID",
        "The stored location identity does not match this subject.",
      );
    }
  }

  async get(subject: LocationSubject): Promise<PreciseLocation | null> {
    assertLocationSubject(subject);
    const result = await this.client.execute({ sql: `
      SELECT id,
             subject_kind AS subjectKind,
             subject_id AS subjectId,
             owner_user_id AS ownerUserId,
             plan_id AS planId,
             ciphertext, nonce, auth_tag AS authTag,
             key_version AS keyVersion,
             payload_version AS payloadVersion,
             created_at AS createdAt,
             updated_at AS updatedAt
        FROM private_locations
       WHERE subject_kind = ? AND subject_id = ?
         AND owner_user_id = ? AND plan_id IS ?
    `, args: [
      subject.kind,
      subject.subjectId,
      subject.ownerUserId,
      subject.planId,
    ] });
    const row = result.rows[0] ? toPrivateLocationRow(result.rows[0]) : undefined;
    if (!row) return null;
    const stored = toStored(row);
    return decryptLocation(stored, stored.subject, this.keyring);
  }

  async delete(subject: LocationSubject): Promise<boolean> {
    assertLocationSubject(subject);
    const result = await this.client.execute({ sql: `
      DELETE FROM private_locations
       WHERE subject_kind = ? AND subject_id = ?
         AND owner_user_id = ? AND plan_id IS ?
    `, args: [subject.kind, subject.subjectId, subject.ownerUserId, subject.planId] });
    return result.rowsAffected === 1;
  }

  async listEncryptedByKeyVersion(keyVersion: string): Promise<StoredPrivateLocation[]> {
    const result = await this.client.execute({ sql: `
      SELECT id,
             subject_kind AS subjectKind,
             subject_id AS subjectId,
             owner_user_id AS ownerUserId,
             plan_id AS planId,
             ciphertext, nonce, auth_tag AS authTag,
             key_version AS keyVersion,
             payload_version AS payloadVersion,
             created_at AS createdAt,
             updated_at AS updatedAt
        FROM private_locations
       WHERE key_version = ?
       ORDER BY id
    `, args: [keyVersion] });
    return result.rows.map((row) => toStored(toPrivateLocationRow(row)));
  }

  async rotate(stored: StoredPrivateLocation, targetKeyring: LocationKeyring): Promise<boolean> {
    const plaintext = decryptLocation(stored, stored.subject, this.keyring);
    const rotated: EncryptedLocationEnvelope = encryptLocation(
      plaintext,
      stored.subject,
      targetKeyring,
    );
    const updatedAt = new Date().toISOString();
    const result = await this.client.execute({ sql: `
      UPDATE private_locations
         SET ciphertext = ?, nonce = ?, auth_tag = ?, key_version = ?,
             payload_version = ?, updated_at = ?
       WHERE id = ? AND key_version = ? AND updated_at = ?
    `, args: [
      rotated.ciphertext,
      rotated.nonce,
      rotated.authTag,
      rotated.keyVersion,
      rotated.payloadVersion,
      updatedAt,
      stored.id,
      stored.keyVersion,
      stored.updatedAt,
    ] });
    return result.rowsAffected === 1;
  }
}
