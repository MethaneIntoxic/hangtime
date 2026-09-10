import type { Client } from "@libsql/client";

export const READINESS_INTEGRITY_MIGRATION = "0005_readiness_and_plan_integrity";
export const PENDING_SEAT_RESERVATIONS_MIGRATION = "0006_pending_seat_reservations";
export const AUTH_INVITE_CONTINUATIONS_MIGRATION = "0007_auth_invite_continuations";

export const AUTH_INVITE_CONTINUATION_INDEX_NAMES = [
  "auth_invite_continuations_invite_status_idx",
  "auth_invite_continuations_expiry_idx",
] as const;

type SqlExecutor = Pick<Client, "execute">;
type TransactionalClient = Omit<Client, "transaction"> & { transaction?: Client["transaction"] };

const UNIQUE_IDENTITY_CHECKS = [
  {
    description: "plan_participants(plan_id, user_id)",
    table: "plan_participants",
    columns: ["plan_id", "user_id"],
  },
  {
    description: "ballots(plan_id, run_id, user_id)",
    table: "ballots",
    columns: ["plan_id", "run_id", "user_id"],
  },
  {
    description: "recommendation_runs(plan_id, plan_version)",
    table: "recommendation_runs",
    columns: ["plan_id", "plan_version"],
  },
  {
    description: "plan_decisions(plan_id)",
    table: "plan_decisions",
    columns: ["plan_id"],
  },
] as const;

export const PENDING_INVITE_COLUMNS = [
  { name: "reservation_kind", sql: "ALTER TABLE plan_invites ADD COLUMN reservation_kind TEXT" },
  { name: "reserved_user_id", sql: "ALTER TABLE plan_invites ADD COLUMN reserved_user_id TEXT" },
  { name: "intended_email_hash", sql: "ALTER TABLE plan_invites ADD COLUMN intended_email_hash TEXT" },
  { name: "revoked_at", sql: "ALTER TABLE plan_invites ADD COLUMN revoked_at TEXT" },
  { name: "accepted_user_id", sql: "ALTER TABLE plan_invites ADD COLUMN accepted_user_id TEXT" },
  { name: "superseded_by_invite_id", sql: "ALTER TABLE plan_invites ADD COLUMN superseded_by_invite_id TEXT" },
] as const;

export const PENDING_INVITE_INDEX_NAMES = [
  "plan_invites_plan_status_idx",
  "plan_invites_plan_email_status_idx",
  "plan_invites_plan_user_status_idx",
] as const;

const PENDING_INVITE_INDEXES = `
  CREATE INDEX IF NOT EXISTS ${PENDING_INVITE_INDEX_NAMES[0]}
    ON plan_invites(plan_id, accepted_at, revoked_at, expires_at);
  CREATE INDEX IF NOT EXISTS ${PENDING_INVITE_INDEX_NAMES[1]}
    ON plan_invites(plan_id, intended_email_hash, accepted_at, revoked_at);
  CREATE INDEX IF NOT EXISTS ${PENDING_INVITE_INDEX_NAMES[2]}
    ON plan_invites(plan_id, reserved_user_id, accepted_at, revoked_at);
`;

async function hasColumn(executor: SqlExecutor, table: string, column: string): Promise<boolean> {
  const columns = await executor.execute(`PRAGMA table_info(${table})`);
  return columns.rows.some((row) => String(row.name) === column);
}

async function findDuplicateIdentities(executor: SqlExecutor): Promise<string[]> {
  const duplicates: string[] = [];
  for (const check of UNIQUE_IDENTITY_CHECKS) {
    const result = await executor.execute(`
      SELECT 1
        FROM ${check.table}
       GROUP BY ${check.columns.join(", ")}
      HAVING COUNT(*) > 1
       LIMIT 1
    `);
    if (result.rows.length > 0) duplicates.push(check.description);
  }
  return duplicates;
}

/**
 * Idempotent upgrades for databases created by an older Hangtime release.
 * This is invoked only by local bootstrap and the explicit Turso migration
 * command; Vercel request startup never performs schema writes.
 */
export async function applyIncrementalMigrations(client: Client): Promise<void> {
  const transactionFactory = (client as TransactionalClient).transaction;
  const transaction = transactionFactory ? await client.transaction("write") : undefined;
  let explicitTransaction = false;
  try {
    if (!transaction) {
      // Client.transaction is part of the @libsql/client contract. Keep the
      // explicit SQL fallback for lightweight test doubles and older adapters.
      await client.execute("BEGIN IMMEDIATE");
      explicitTransaction = true;
    }
    const executor = transaction ?? client;
    const duplicates = await findDuplicateIdentities(executor);
    if (duplicates.length > 0) {
      throw new Error(
        `Migration ${READINESS_INTEGRITY_MIGRATION} cannot apply: duplicate rows violate ` +
        `${duplicates.join("; ")}. Resolve duplicates without deleting or merging data, then retry.`,
      );
    }

    if (!(await hasColumn(executor, "plan_participants", "dietary_declared"))) {
      await executor.execute(
        "ALTER TABLE plan_participants ADD COLUMN dietary_declared INTEGER NOT NULL DEFAULT 0",
      );
    }
    if (transaction) {
      await transaction.executeMultiple(`
      CREATE UNIQUE INDEX IF NOT EXISTS plan_participants_plan_user_uq
        ON plan_participants(plan_id, user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS ballots_plan_run_user_uq
        ON ballots(plan_id, run_id, user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS recommendation_runs_plan_version_uq
        ON recommendation_runs(plan_id, plan_version);
      CREATE UNIQUE INDEX IF NOT EXISTS plan_decisions_plan_uq
        ON plan_decisions(plan_id);
      `);
    } else {
      await client.executeMultiple(`
        CREATE UNIQUE INDEX IF NOT EXISTS plan_participants_plan_user_uq
          ON plan_participants(plan_id, user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS ballots_plan_run_user_uq
          ON ballots(plan_id, run_id, user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS recommendation_runs_plan_version_uq
          ON recommendation_runs(plan_id, plan_version);
        CREATE UNIQUE INDEX IF NOT EXISTS plan_decisions_plan_uq
          ON plan_decisions(plan_id);
      `);
    }

    for (const column of PENDING_INVITE_COLUMNS) {
      if (!(await hasColumn(executor, "plan_invites", column.name))) {
        await executor.execute(column.sql);
      }
    }
    if (transaction) await transaction.executeMultiple(PENDING_INVITE_INDEXES);
    else await client.executeMultiple(PENDING_INVITE_INDEXES);

    if (transaction) {
      await transaction.executeMultiple(`
        CREATE TABLE IF NOT EXISTS auth_magic_links (
          id TEXT PRIMARY KEY,
          email_normalized TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          delivery_status TEXT NOT NULL DEFAULT 'pending',
          provider_message_id TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS auth_magic_links_email_created_idx
          ON auth_magic_links(email_normalized, created_at);
        CREATE INDEX IF NOT EXISTS auth_magic_links_expires_idx
          ON auth_magic_links(expires_at);
        CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
        CREATE INDEX IF NOT EXISTS auth_sessions_expiry_revoked_idx
          ON auth_sessions(expires_at, revoked_at);
      `);
    } else {
      await client.executeMultiple(`
        CREATE TABLE IF NOT EXISTS auth_magic_links (
          id TEXT PRIMARY KEY, email_normalized TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL, consumed_at TEXT, delivery_status TEXT NOT NULL DEFAULT 'pending',
          provider_message_id TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_sessions (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS auth_magic_links_email_created_idx
          ON auth_magic_links(email_normalized, created_at);
        CREATE INDEX IF NOT EXISTS auth_magic_links_expires_idx ON auth_magic_links(expires_at);
        CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
        CREATE INDEX IF NOT EXISTS auth_sessions_expiry_revoked_idx ON auth_sessions(expires_at, revoked_at);
      `);
    }
    if (!(await hasColumn(executor, "auth_magic_links", "continuation_id"))) {
      await executor.execute("ALTER TABLE auth_magic_links ADD COLUMN continuation_id TEXT");
    }
    if (!(await hasColumn(executor, "auth_sessions", "pending_invite_id"))) {
      await executor.execute("ALTER TABLE auth_sessions ADD COLUMN pending_invite_id TEXT");
    }
    const continuationTable = `
      CREATE TABLE IF NOT EXISTS auth_invite_continuations (
        id TEXT PRIMARY KEY,
        handle_hash TEXT NOT NULL UNIQUE,
        invite_id TEXT NOT NULL,
        intended_email_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS ${AUTH_INVITE_CONTINUATION_INDEX_NAMES[0]}
        ON auth_invite_continuations(invite_id, consumed_at, revoked_at, expires_at);
      CREATE INDEX IF NOT EXISTS ${AUTH_INVITE_CONTINUATION_INDEX_NAMES[1]}
        ON auth_invite_continuations(expires_at);
    `;
    if (transaction) await transaction.executeMultiple(continuationTable);
    else await client.executeMultiple(continuationTable);

    await executor.execute({
      sql: "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, datetime('now'))",
      args: [READINESS_INTEGRITY_MIGRATION],
    });
    await executor.execute({
      sql: "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, datetime('now'))",
      args: [PENDING_SEAT_RESERVATIONS_MIGRATION],
    });
    await executor.execute({
      sql: "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, datetime('now'))",
      args: [AUTH_INVITE_CONTINUATIONS_MIGRATION],
    });
    if (transaction) await transaction.commit();
    else await client.execute("COMMIT");
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        // Preserve the original migration error if the driver has already closed
        // a failed transaction stream.
      }
    } else if (explicitTransaction) {
      try {
        await client.execute("ROLLBACK");
      } catch {
        // Preserve the original migration error if the fallback transaction is closed.
      }
    }
    throw error;
  } finally {
    transaction?.close();
  }
}
