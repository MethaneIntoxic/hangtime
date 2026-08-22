import type { Client } from "@libsql/client";

export const READINESS_INTEGRITY_MIGRATION = "0005_readiness_and_plan_integrity";

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
    await executor.execute({
      sql: "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, datetime('now'))",
      args: [READINESS_INTEGRITY_MIGRATION],
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
