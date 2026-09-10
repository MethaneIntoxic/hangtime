import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { initDatabase } from "@/lib/db/init";
import {
  applyIncrementalMigrations,
  AUTH_INVITE_CONTINUATIONS_MIGRATION,
  AUTH_INVITE_CONTINUATION_INDEX_NAMES,
  PENDING_SEAT_RESERVATIONS_MIGRATION,
  READINESS_INTEGRITY_MIGRATION,
} from "@/lib/db/migrations";
import { countPlanSeats } from "@/lib/db/plan-mutations";

const INDEX_NAMES = [
  "plan_participants_plan_user_uq",
  "ballots_plan_run_user_uq",
  "recommendation_runs_plan_version_uq",
  "plan_decisions_plan_uq",
] as const;

const INVITE_INDEX_NAMES = [
  "plan_invites_plan_status_idx",
  "plan_invites_plan_email_status_idx",
  "plan_invites_plan_user_status_idx",
] as const;

const INVITE_RESERVATION_COLUMNS = [
  "reservation_kind",
  "reserved_user_id",
  "intended_email_hash",
  "revoked_at",
  "accepted_user_id",
  "superseded_by_invite_id",
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
    CREATE TABLE plan_invites (
      id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, email TEXT, token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, accepted_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE ballots (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, run_id TEXT NOT NULL, user_id TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE recommendation_runs (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, plan_version INTEGER NOT NULL);
    CREATE TABLE plan_decisions (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL);
    CREATE TABLE auth_magic_links (
      id TEXT PRIMARY KEY, email_normalized TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, consumed_at TEXT, delivery_status TEXT NOT NULL DEFAULT 'pending',
      provider_message_id TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
    );
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
      const inviteColumns = new Set(
        (await db.execute("PRAGMA table_info(plan_invites)")).rows.map((row) => String(row.name)),
      );
      for (const column of INVITE_RESERVATION_COLUMNS) expect(inviteColumns.has(column)).toBe(true);
      const migration = await db.execute({
        sql: "SELECT 1 FROM schema_migrations WHERE version = ?",
        args: [READINESS_INTEGRITY_MIGRATION],
      });
      expect(migration.rows).toHaveLength(1);
      const reservationMigration = await db.execute({
        sql: "SELECT 1 FROM schema_migrations WHERE version = ?",
        args: [PENDING_SEAT_RESERVATIONS_MIGRATION],
      });
      expect(reservationMigration.rows).toHaveLength(1);
      const continuationMigration = await db.execute({
        sql: "SELECT 1 FROM schema_migrations WHERE version = ?",
        args: [AUTH_INVITE_CONTINUATIONS_MIGRATION],
      });
      expect(continuationMigration.rows).toHaveLength(1);
      expect((await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_invite_continuations'")).rows).toHaveLength(1);
      expect((await db.execute("PRAGMA table_info(auth_magic_links)")).rows.map((row) => String(row.name))).toContain("continuation_id");
      expect((await db.execute("PRAGMA table_info(auth_sessions)")).rows.map((row) => String(row.name))).toContain("pending_invite_id");
      const indexes = await indexNames(db);
      for (const indexName of INDEX_NAMES) expect(indexes.has(indexName)).toBe(true);
      for (const indexName of INVITE_INDEX_NAMES) expect(indexes.has(indexName)).toBe(true);
      const continuationIndexes = await indexNames(db);
      for (const indexName of AUTH_INVITE_CONTINUATION_INDEX_NAMES) expect(continuationIndexes.has(indexName)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("preserves legacy pending and accepted invite rows while adding nullable fields", async () => {
    const { db } = await createLegacyDatabase();
    try {
      await db.execute("CREATE TABLE plans (id TEXT PRIMARY KEY, state TEXT NOT NULL)");
      await db.execute({
        sql: "INSERT INTO plans (id, state) VALUES ('plan_1', 'collecting')",
      });
      await db.execute({
        sql: `INSERT INTO plan_invites
          (id, plan_id, email, token_hash, expires_at, accepted_at, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
        args: [
          "invite_pending",
          "plan_1",
          "pending@example.com",
          "hash_pending",
          "2026-08-25T00:00:00.000Z",
          "user_1",
          "2026-08-22T00:00:00.000Z",
        ],
      });
      await db.execute({
        sql: `INSERT INTO auth_magic_links
          (id, email_normalized, token_hash, expires_at, consumed_at, delivery_status, provider_message_id, created_at)
        VALUES (?, ?, ?, ?, NULL, 'sent', ?, ?)`,
        args: ["auth_link_legacy", "legacy@example.com", "legacy-link-hash", "2026-08-25T00:00:00.000Z", "provider-1", "2026-08-22T00:00:00.000Z"],
      });
      await db.execute({
        sql: `INSERT INTO auth_sessions
          (id, user_id, token_hash, expires_at, revoked_at, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?)`,
        args: ["auth_session_legacy", "legacy-user", "legacy-session-hash", "2026-08-25T00:00:00.000Z", "2026-08-22T00:00:00.000Z", "2026-08-22T00:00:00.000Z"],
      });
      await db.execute({
        sql: `INSERT INTO plan_invites
          (id, plan_id, email, token_hash, expires_at, accepted_at, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "invite_accepted",
          "plan_1",
          "accepted@example.com",
          "hash_accepted",
          "2026-08-24T00:00:00.000Z",
          "2026-08-22T01:00:00.000Z",
          "user_1",
          "2026-08-22T00:00:00.000Z",
        ],
      });

      await applyIncrementalMigrations(db);
      await applyIncrementalMigrations(db);

      const rows = await db.execute(`
        SELECT id, plan_id, email, token_hash, expires_at, accepted_at, created_by, created_at,
               reservation_kind, reserved_user_id, intended_email_hash, revoked_at,
               accepted_user_id, superseded_by_invite_id
          FROM plan_invites
         ORDER BY id
      `);
      expect(rows.rows).toEqual([
        expect.objectContaining({
          id: "invite_accepted",
          plan_id: "plan_1",
          email: "accepted@example.com",
          token_hash: "hash_accepted",
          accepted_at: "2026-08-22T01:00:00.000Z",
          reservation_kind: null,
          reserved_user_id: null,
          intended_email_hash: null,
          revoked_at: null,
          accepted_user_id: null,
          superseded_by_invite_id: null,
        }),
        expect.objectContaining({
          id: "invite_pending",
          plan_id: "plan_1",
          email: "pending@example.com",
          token_hash: "hash_pending",
          accepted_at: null,
          reservation_kind: null,
          reserved_user_id: null,
          intended_email_hash: null,
          revoked_at: null,
          accepted_user_id: null,
          superseded_by_invite_id: null,
        }),
      ]);
      expect((await db.execute("SELECT email_normalized, token_hash, continuation_id FROM auth_magic_links WHERE id = 'auth_link_legacy'")).rows[0])
        .toMatchObject({ email_normalized: "legacy@example.com", token_hash: "legacy-link-hash", continuation_id: null });
      expect((await db.execute("SELECT user_id, token_hash, pending_invite_id FROM auth_sessions WHERE id = 'auth_session_legacy'")).rows[0])
        .toMatchObject({ user_id: "legacy-user", token_hash: "legacy-session-hash", pending_invite_id: null });
      await expect(countPlanSeats(db, "plan_1", "2026-08-22T02:00:00.000Z")).resolves.toEqual({
        activeParticipants: 0,
        liveReservations: 0,
        total: 0,
      });
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
      const reservationMigration = await db.execute({
        sql: "SELECT 1 FROM schema_migrations WHERE version = ?",
        args: [PENDING_SEAT_RESERVATIONS_MIGRATION],
      });
      expect(reservationMigration.rows).toHaveLength(0);
      const indexes = await indexNames(db);
      for (const indexName of INDEX_NAMES) expect(indexes.has(indexName)).toBe(false);
      for (const indexName of INVITE_INDEX_NAMES) expect(indexes.has(indexName)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("reaches the duplicate preflight before init creates the participant identity index", async () => {
    const { db } = await createLegacyDatabase();
    try {
      await db.execute({
        sql: `INSERT INTO plan_participants
          (id, plan_id, user_id, role, coarse_origin_label, is_ready, acknowledged_state, joined_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ["part_1", "plan_1", "user_1", "member", "Novena", "0", "pending", "2026-08-22T00:00:00.000Z"],
      });
      await db.execute({
        sql: `INSERT INTO plan_participants
          (id, plan_id, user_id, role, coarse_origin_label, is_ready, acknowledged_state, joined_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ["part_2", "plan_1", "user_1", "member", "Novena", "0", "pending", "2026-08-22T00:00:01.000Z"],
      });

      await expect(initDatabase(db, { applyLocalPragmas: false })).rejects.toThrow(
        `Migration ${READINESS_INTEGRITY_MIGRATION} cannot apply: duplicate rows violate plan_participants(plan_id, user_id)`,
      );
      const indexes = await indexNames(db);
      expect(indexes.has("plan_participants_plan_user_uq")).toBe(false);
    } finally {
      db.close();
    }
  });
});
