import { createClient, type InValue } from "@libsql/client";
import Database from "better-sqlite3";
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { initDatabase } from "../src/lib/db/init";
import { getLocationKeyring } from "../src/lib/location/keyring";
import { PrivateLocationRepository } from "../src/lib/location/repository";

const replaceSource = process.argv.includes("--replace");
const configured = process.env.DATABASE_URL?.trim();
if (!configured || configured === ":memory:" || configured.startsWith("file:")) {
  throw new Error("DATABASE_URL must name the on-disk legacy SQLite database.");
}
const sourcePath = path.resolve(configured);
const targetPath = `${sourcePath}.migrating`;
const legacyPendingPath = `${sourcePath}.plaintext-delete-pending`;
if (!existsSync(sourcePath)) throw new Error(`Legacy database not found: ${sourcePath}`);
if (existsSync(targetPath) || existsSync(legacyPendingPath)) {
  throw new Error("A previous migration artifact exists; inspect it before retrying.");
}
if (process.env.NODE_ENV === "production" && process.env.MIGRATION_BACKUP_CONFIRMED !== "true") {
  throw new Error("MIGRATION_BACKUP_CONFIRMED=true is required for production replacement.");
}

const privateColumns = new Set(["postal_code", "lat", "lng"]);
const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
const legacy = new Database(sourcePath, { readonly: true, fileMustExist: true });
const target = createClient({ url: `file:${targetPath.replaceAll("\\", "/")}` });

function tables(database: Database.Database): string[] {
  return (database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all() as Array<{ name: string }>).map((row) => row.name);
}

function columns(database: Database.Database, table: string): string[] {
  return (database.pragma(`table_info(${quote(table)})`) as Array<{ name: string }>).map((row) => row.name);
}

function scan(file: string, values: Array<string | number>): void {
  if (!existsSync(file)) return;
  const bytes = readFileSync(file);
  for (const value of values) {
    if (bytes.indexOf(Buffer.from(String(value), "utf8")) !== -1) {
      throw new Error(`Plaintext location canary remains in ${path.basename(file)}.`);
    }
  }
}

try {
  for (const table of ["profiles", "plan_participants"]) {
    const names = new Set(columns(legacy, table));
    if (!["postal_code", "lat", "lng"].every((name) => names.has(name))) {
      throw new Error(`${table} is not the expected legacy plaintext schema.`);
    }
  }
  await initDatabase(target);
  const sourceTables = new Set(tables(legacy));
  const targetTables = (await target.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )).rows.map((row) => String(row.name));

  for (const table of targetTables) {
    if (["private_locations", "schema_migrations"].includes(table) || !sourceTables.has(table)) continue;
    const sourceColumns = new Set(columns(legacy, table));
    const targetColumns = (await target.execute(`PRAGMA table_info(${quote(table)})`)).rows
      .map((row) => String(row.name));
    const common = targetColumns.filter((name) =>
      sourceColumns.has(name) &&
      (!(table === "profiles" || table === "plan_participants") || !privateColumns.has(name))
    );
    if (common.length === 0) continue;
    const selection = common.map(quote).join(", ");
    const rows = legacy.prepare(`SELECT ${selection} FROM ${quote(table)}`).all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      await target.execute({
        sql: `INSERT INTO ${quote(table)} (${selection}) VALUES (${common.map(() => "?").join(", ")})`,
        args: common.map((name) => row[name] as InValue),
      });
    }
  }

  const repository = new PrivateLocationRepository(target, getLocationKeyring());
  const profiles = legacy.prepare(
    "SELECT id, postal_code AS postalCode, lat, lng FROM profiles WHERE lat IS NOT NULL AND lng IS NOT NULL",
  ).all() as Array<{ id: string; postalCode: string | null; lat: number; lng: number }>;
  for (const row of profiles) {
    await repository.put(
      { kind: "profile", subjectId: row.id, ownerUserId: row.id, planId: null },
      { postalCode: row.postalCode, lat: row.lat, lng: row.lng },
    );
  }
  const participants = legacy.prepare(
    `SELECT id, user_id AS userId, plan_id AS planId, postal_code AS postalCode, lat, lng
       FROM plan_participants WHERE lat IS NOT NULL AND lng IS NOT NULL`,
  ).all() as Array<{ id: string; userId: string; planId: string; postalCode: string | null; lat: number; lng: number }>;
  for (const row of participants) {
    await repository.put(
      { kind: "plan_participant", subjectId: row.id, ownerUserId: row.userId, planId: row.planId },
      { postalCode: row.postalCode, lat: row.lat, lng: row.lng },
    );
  }

  const integrity = await target.execute("PRAGMA integrity_check");
  if (integrity.rows.length !== 1 || integrity.rows[0].integrity_check !== "ok") {
    throw new Error("Migrated database failed SQLite integrity_check.");
  }
  const canaries = profiles.flatMap((row) => [row.postalCode ?? "", row.lat, row.lng]).filter(Boolean);
  target.close();
  legacy.close();
  scan(targetPath, canaries);
  if (replaceSource) {
    renameSync(sourcePath, legacyPendingPath);
    try { copyFileSync(targetPath, sourcePath); }
    catch (error) { renameSync(legacyPendingPath, sourcePath); throw error; }
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${legacyPendingPath}${suffix}`, { force: true });
    try { rmSync(targetPath, { force: true }); } catch { /* process exit releases native handle */ }
    console.log(`LOCATION_ENCRYPTION_MIGRATION_PASS replaced=${sourcePath}`);
  } else {
    console.log(`LOCATION_ENCRYPTION_MIGRATION_PASS target=${targetPath}`);
  }
} catch (error) {
  target.close();
  if (legacy.open) legacy.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { rmSync(`${targetPath}${suffix}`, { force: true }); } catch { /* preserve root error */ }
  }
  throw error;
}
