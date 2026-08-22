import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("legacy location migration", () => {
  it("replaces plaintext columns with authenticated envelopes", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hangtime-location-migration-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "legacy.db");
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE profiles (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
        avatar_path TEXT, account_kind TEXT NOT NULL, timezone TEXT NOT NULL,
        coarse_area TEXT, postal_code TEXT, lat REAL, lng REAL,
        notification_prefs TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE plan_participants (
        id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, user_id TEXT NOT NULL,
        role TEXT NOT NULL, coarse_origin_label TEXT, postal_code TEXT,
        lat REAL, lng REAL, is_ready INTEGER NOT NULL,
        acknowledged_state TEXT NOT NULL, joined_at TEXT NOT NULL
      );
    `);
    const now = new Date().toISOString();
    legacy.prepare(`
      INSERT INTO profiles VALUES
      ('user_canary', 'canary@example.com', 'Canary', NULL, 'full', 'Asia/Singapore',
       'Novena / Balestier (Central)', '918273', 1.234567890123, 103.987654321,
       '{"email":true,"push":false}', ?, ?)
    `).run(now, now);
    legacy.prepare(`
      INSERT INTO plan_participants VALUES
      ('part_canary', 'plan_canary', 'user_canary', 'organizer',
       'Novena / Balestier (Central)', '918273', 1.234567890123, 103.987654321,
       1, 'pending', ?)
    `).run(now);
    legacy.close();

    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
       path.join(process.cwd(), "scripts", "migrate-location-encryption.ts"), "--replace"],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databasePath },
        encoding: "utf8",
      },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("LOCATION_ENCRYPTION_MIGRATION_PASS");
    expect(fs.existsSync(`${databasePath}.plaintext-delete-pending`)).toBe(false);

    const migrated = new Database(databasePath, { readonly: true });
    const profileColumns = migrated.pragma("table_info(profiles)") as Array<{ name: string }>;
    const participantColumns = migrated.pragma("table_info(plan_participants)") as Array<{ name: string }>;
    for (const columns of [profileColumns, participantColumns]) {
      expect(columns.map((column) => column.name)).not.toEqual(
        expect.arrayContaining(["postal_code", "lat", "lng"]),
      );
    }
    expect(
      (migrated.prepare("SELECT COUNT(*) AS count FROM private_locations").get() as { count: number }).count,
    ).toBe(2);
    expect(migrated.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
    migrated.close();

    const databaseBytes = fs.readFileSync(databasePath);
    expect(databaseBytes.includes(Buffer.from("918273", "utf8"))).toBe(false);
    expect(databaseBytes.includes(Buffer.from("1.234567890123", "utf8"))).toBe(false);
    expect(databaseBytes.includes(Buffer.from("103.987654321", "utf8"))).toBe(false);
  });
});
