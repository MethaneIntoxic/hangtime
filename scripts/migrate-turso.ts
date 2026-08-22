import { createClient } from "@libsql/client";
import { initDatabase } from "../src/lib/db/init";
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
  await initDatabase(client);
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
  console.log(`TURSO_MIGRATION_PASS active_location_key=${keyring.activeVersion}`);
} finally {
  client.close();
}
