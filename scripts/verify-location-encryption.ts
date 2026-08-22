import { createClient } from "@libsql/client";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { getLocationKeyring } from "../src/lib/location/keyring";
import { PrivateLocationRepository } from "../src/lib/location/repository";

const LEGACY_COLUMNS = new Set(["postal_code", "lat", "lng"]);

function encodeCanaryVariants(value: string): Buffer[] {
  const variants = [Buffer.from(value, "utf8"), Buffer.from(value, "utf16le")];
  const number = Number(value);
  if (Number.isFinite(number)) {
    const little = Buffer.alloc(8);
    little.writeDoubleLE(number);
    const big = Buffer.alloc(8);
    big.writeDoubleBE(number);
    variants.push(little, big);
  }
  return variants;
}

const databaseUrl = process.env.TURSO_DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("TURSO_DATABASE_URL is required.");
const dbPath = databaseUrl.startsWith("file:") ? databaseUrl.slice(5) : null;
const keyring = getLocationKeyring();
const sqlite = createClient({
  url: databaseUrl,
  authToken: process.env.TURSO_AUTH_TOKEN?.trim(),
});

try {
  const tables = ["profiles", "plan_participants"];
  for (const table of tables) {
    const columns = (await sqlite.execute(`PRAGMA table_info(${table})`)).rows;
    const found = columns.map((column) => String(column.name)).filter((name) => LEGACY_COLUMNS.has(name));
    if (found.length > 0) {
      throw new Error(`${table} retains plaintext location columns: ${found.join(", ")}`);
    }
  }

  const privateColumns = (await sqlite.execute("PRAGMA table_info(private_locations)")).rows;
  if (privateColumns.length === 0) throw new Error("private_locations is missing.");
  const malformed = await sqlite.execute(`
    SELECT COUNT(*) AS count
      FROM private_locations
     WHERE length(nonce) <> 12 OR length(auth_tag) <> 16
        OR length(ciphertext) = 0 OR payload_version <> 1
  `);
  const malformedCount = Number(malformed.rows[0]?.count ?? 0);
  if (malformedCount > 0) {
    throw new Error(`${malformedCount} private location envelope(s) are malformed.`);
  }
  const missingReadyLocations = await sqlite.execute(`
    SELECT COUNT(*) AS count
      FROM plan_participants AS participant
     WHERE participant.is_ready = 1
       AND NOT EXISTS (
         SELECT 1 FROM private_locations AS location
          WHERE location.subject_kind = 'plan_participant'
            AND location.subject_id = participant.id
            AND location.owner_user_id = participant.user_id
            AND location.plan_id = participant.plan_id
       )
  `);
  const missingReadyCount = Number(missingReadyLocations.rows[0]?.count ?? 0);
  if (missingReadyCount > 0) {
    throw new Error(`${missingReadyCount} ready participant(s) lack encrypted origins.`);
  }

  const orphanedLocations = await sqlite.execute(`
    SELECT COUNT(*) AS count
      FROM private_locations AS location
     WHERE (location.subject_kind = 'profile' AND NOT EXISTS (
              SELECT 1 FROM profiles WHERE profiles.id = location.subject_id
           ))
        OR (location.subject_kind = 'plan_participant' AND NOT EXISTS (
              SELECT 1 FROM plan_participants WHERE plan_participants.id = location.subject_id
           ))
  `);
  const orphanedCount = Number(orphanedLocations.rows[0]?.count ?? 0);
  if (orphanedCount > 0) {
    throw new Error(`${orphanedCount} encrypted location(s) are orphaned.`);
  }

  const versions = (await sqlite.execute(
    "SELECT DISTINCT key_version AS keyVersion FROM private_locations",
  )).rows;
  const repository = new PrivateLocationRepository(sqlite, keyring);
  let verified = 0;
  for (const { keyVersion } of versions) {
    const version = String(keyVersion);
    if (!keyring.keys.has(version)) {
      throw new Error(`Stored location key version ${keyVersion} is unavailable.`);
    }
    for (const row of await repository.listEncryptedByKeyVersion(version)) {
      await repository.get(row.subject);
      verified += 1;
    }
  }

  const integrity = (await sqlite.execute("PRAGMA integrity_check")).rows;
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
    throw new Error("SQLite integrity_check did not return ok.");
  }
  const foreignKeyFailures = (await sqlite.execute("PRAGMA foreign_key_check")).rows;
  if (foreignKeyFailures.length > 0) {
    throw new Error(`SQLite foreign_key_check returned ${foreignKeyFailures.length} failure(s).`);
  }

  const canaries = (process.env.LOCATION_PLAINTEXT_CANARIES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const suffix of dbPath ? ["", "-wal", "-shm"] : []) {
    const file = `${dbPath}${suffix}`;
    if (!existsSync(file)) continue;
    const bytes = readFileSync(file);
    for (const canary of canaries) {
      for (const encoded of encodeCanaryVariants(canary)) {
        if (bytes.indexOf(encoded) !== -1) {
          throw new Error(`Plaintext location canary was found in ${path.basename(file)}.`);
        }
      }
    }
  }

  console.log(
    `LOCATION_ENCRYPTION_VERIFY_PASS active_version=${keyring.activeVersion} rows=${verified}`,
  );
} finally {
  sqlite.close();
}
