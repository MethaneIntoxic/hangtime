import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { applyIncrementalMigrations, READINESS_INTEGRITY_MIGRATION } from "@/lib/db/migrations";

const INDEX_NAMES = [
  "plan_participants_plan_user_uq",
  "ballots_plan_run_user_uq",
  "recommendation_runs_plan_version_uq",
  "plan_decisions_plan_uq",
] as const;

type SeedStatement = { sql: string; args: string[] };

const DUPLICATE_CASES: Array<{
  description: string;
  identity: string;
  statements: [SeedStatement, SeedStatement];
}> = [
  {
    description: "duplicate plan participants",
    identity: "plan_participants(plan_id, user_id)",
    statements: [
      { sql: "INSERT INTO plan_participants (id, plan_id, user_id, role, coarse_origin_label, is_ready, acknowledged_state, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", args: ["part_1", "plan_1", "user_1", "member", "Novena", "0", "pending", "2026-08-22T00:00:00.000Z"] },
      { sql: "INSERT INTO plan_participants (id, plan_id, user_id, role, coarse_origin_label, is_ready, acknowledged_state, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", args: ["part_2", "plan_1", "user_1", "member", "Novena", "0", "pending", "2026-08-22T00:00:01.000Z"] },
    ],
  },
  {
    description: "duplicate ballots",
    identity: "ballots(plan_id, run_id, user_id)",
    statements: [
      { sql: "INSERT INTO ballots (id, plan_id, run_id, user_id, updated_at) VALUES (?, ?, ?, ?, ?)", args: ["ballot_1", "plan_1", "run_1", "user_1", "2026-08-22T00:00:00.000Z"] },
      { sql: "INSERT INTO ballots (id, plan_id, run_id, user_id, updated_at) VALUES (?, ?, ?, ?, ?)", args: ["ballot_2", "plan_1", "run_1", "user_1", "2026-08-22T00:00:01.000Z"] },
    ],
  },
  {
    description: "duplicate recommendation runs",
    identity: "recommendation_runs(plan_id, plan_version)",
    statements: [
      { sql: "INSERT INTO recommendation_runs (id, plan_id, plan_version) VALUES (?, ?, ?)", args: ["run_1", "plan_1", "2"] },
      { sql: "INSERT INTO recommendation_runs (id, plan_id, plan_version) VALUES (?, ?, ?)", args: ["run_2", "plan_1", "2"] },
    ],
  },
  {
    description: "duplicate plan decisions",
    identity: "plan_decisions(plan_id)",
    statements: [
      { sql: "INSERT INTO plan_decisions (id, plan_id) VALUES (?, ?)", args: ["decision_1", "plan_1"] },
      { sql: "INSERT INTO plan_decisions (id, plan_id) VALUES (?, ?)", args: ["decision_2", "plan_1"] },
    ],
  },
];

async function createLegacyDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hangtime-migration-"));
  const db = createClient({ url: `file:${path.join(directory, "legacy.db").replaceAll("\\", "/")}` });
  await db.executeMultiple(`
    CREATE TABLE plan_participants (
      id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, user_id TEXT NOT NULL,
      role TEXT NOT NULL, coarse_origin_label TEXT, is_ready INTEGER NOT NULL DEFAULT 0,
      acknowledged_state TEXT NOT NULL, joined_at TEXT NOT NULL
    );
    CREATE TABLE ballots (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, run_id TEXT NOT NULL, user_id TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE recommendation_runs (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, plan_version INTEGER NOT NULL);
    CREATE TABLE plan_decisions (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL);
    CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
  `);
  return { db, directory };
}

async function indexNames(db: ReturnType<typeof createClient>): Promise<Set<string>> {
  return new Set((await db.execute("SELECT name FROM sqlite_master WHERE type = 'index'")).rows.map((row) => String(row.name)));
}

describe("incremental database migrations", () => {
  it("upgrades a pre-readiness schema and records the deployable migration", async () => {
    const { db } = await createLegacyDatabase();
    try {
      await applyIncrementalMigrations(db);
      await applyIncrementalMigrations(db);

      const columns = (await db.execute("PRAGMA table_info(plan_participants)")).rows.map((row) => String(row.name));
      expect(columns).toContain("dietary_declared");
      const migration = await db.execute({
        sql: "SELECT 1 FROM schema_migrations WHERE version = ?",
        args: [READINESS_INTEGRITY_MIGRATION],
      });
      expect(migration.rows).toHaveLength(1);
      const indexes = await indexNames(db);
      for (const indexName of INDEX_NAMES) expect(indexes.has(indexName)).toBe(true);
    } finally {
      db.close();
    }
  });

  it.each(DUPLICATE_CASES)("fails closed before changing schema for $description", async ({ identity, statements }) => {
    const { db } = await createLegacyDatabase();
    try {
      for (const statement of statements) await db.execute(statement);

      await expect(applyIncrementalMigrations(db)).rejects.toThrow(
        `Migration ${READINESS_INTEGRITY_MIGRATION} cannot apply: duplicate rows violate ${identity}`,
      );
      const columns = (await db.execute("PRAGMA table_info(plan_participants)")).rows.map((row) => String(row.name));
      expect(columns).not.toContain("dietary_declared");
      const migration = await db.execute({
        sql: "SELECT 1 FROM schema_migrations WHERE version = ?",
        args: [READINESS_INTEGRITY_MIGRATION],
      });
      expect(migration.rows).toHaveLength(0);
      const indexes = await indexNames(db);
      for (const indexName of INDEX_NAMES) expect(indexes.has(indexName)).toBe(false);
    } finally {
      db.close();
    }
  });
});
