import { createClient } from "@libsql/client";
import { initDatabase } from "../src/lib/db/init";
import {
  PENDING_INVITE_COLUMNS,
  PENDING_INVITE_INDEX_NAMES,
  PENDING_SEAT_RESERVATIONS_MIGRATION,
} from "../src/lib/db/migrations";
import { getLocationKeyring } from "../src/lib/location/keyring";

const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
if (!url || !["libsql:", "https:"].includes(new URL(url).protocol)) {
  throw new Error("TURSO_DATABASE_URL must be a remote libsql or HTTPS URL.");
}
if (!authToken) throw new Error("TURSO_AUTH_TOKEN is required.");

// Parse crypto configuration before changing durable state. A deployment must
// never create storage it cannot subsequently decrypt.
const keyring = getLocationKeyring();
const client = createClient({ url, authToken });

try {
  await initDatabase(client, { applyLocalPragmas: false });
  const integrity = await client.execute("PRAGMA integrity_check");
  if (integrity.rows.length !== 1 || integrity.rows[0].integrity_check !== "ok") {
    throw new Error("Remote database integrity check failed.");
  }
  const requiredTables = [
    "profiles", "plans", "plan_participants", "plan_invites",
    "auth_magic_links", "auth_sessions", "auth_rate_limits", "private_locations",
  ];
  const tables = new Set((await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  )).rows.map((row) => String(row.name)));
  const missing = requiredTables.filter((table) => !tables.has(table));
  if (missing.length > 0) throw new Error(`Remote migration is incomplete: ${missing.join(", ")}`);
  const participantColumns = new Set((await client.execute(
    "PRAGMA table_info(plan_participants)",
  )).rows.map((row) => String(row.name)));
  if (!participantColumns.has("dietary_declared")) {
    throw new Error("Remote migration is incomplete: plan_participants.dietary_declared is missing");
  }
  const integrityMigration = await client.execute({
    sql: "SELECT 1 FROM schema_migrations WHERE version = ?",
    args: ["0005_readiness_and_plan_integrity"],
  });
  if (integrityMigration.rows.length !== 1) {
    throw new Error("Remote migration is incomplete: readiness integrity migration was not recorded");
  }
  const reservationMigration = await client.execute({
    sql: "SELECT 1 FROM schema_migrations WHERE version = ?",
    args: [PENDING_SEAT_RESERVATIONS_MIGRATION],
  });
  if (reservationMigration.rows.length !== 1) {
    throw new Error("Remote migration is incomplete: pending seat reservation migration was not recorded");
  }
  const inviteColumns = new Set((await client.execute(
    "PRAGMA table_info(plan_invites)",
  )).rows.map((row) => String(row.name)));
  const missingInviteColumns = PENDING_INVITE_COLUMNS
    .map((column) => column.name)
    .filter((column) => !inviteColumns.has(column));
  if (missingInviteColumns.length > 0) {
    throw new Error(`Remote migration is incomplete: plan_invites columns missing: ${missingInviteColumns.join(", ")}`);
  }
  const inviteIndexes = new Set((await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'plan_invites'",
  )).rows.map((row) => String(row.name)));
  const missingInviteIndexes = PENDING_INVITE_INDEX_NAMES.filter((name) => !inviteIndexes.has(name));
  if (missingInviteIndexes.length > 0) {
    throw new Error(`Remote migration is incomplete: plan_invites indexes missing: ${missingInviteIndexes.join(", ")}`);
  }
  console.log(`TURSO_MIGRATION_PASS active_location_key=${keyring.activeVersion}`);
} finally {
  client.close();
}
