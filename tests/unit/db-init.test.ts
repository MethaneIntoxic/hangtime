import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { initDatabase } from "@/lib/db/init";

function fakeClient() {
  const execute = vi.fn(async (statement: string) => {
    void statement;
    return { rows: [] };
  });
  const executeMultiple = vi.fn(async (sql: string) => {
    void sql;
  });
  return {
    client: { execute, executeMultiple } as unknown as Client,
    execute,
    executeMultiple,
  };
}

describe("database initialization transport compatibility", () => {
  it("keeps SQLite connection pragmas enabled for local databases", async () => {
    const database = fakeClient();

    await initDatabase(database.client);

    const statements = database.execute.mock.calls.map(([statement]) => String(statement));
    expect(statements).toEqual(expect.arrayContaining([
      "PRAGMA busy_timeout = 10000",
      "PRAGMA foreign_keys = ON",
      "PRAGMA journal_mode = WAL",
    ]));
  });

  it("skips unsupported connection pragmas for remote Turso migrations", async () => {
    const database = fakeClient();

    await initDatabase(database.client, { applyLocalPragmas: false });

    const statements = database.execute.mock.calls.map(([statement]) => String(statement));
    expect(statements).not.toEqual(expect.arrayContaining([
      "PRAGMA busy_timeout = 10000",
      "PRAGMA foreign_keys = ON",
      "PRAGMA journal_mode = WAL",
    ]));
    expect(database.executeMultiple).toHaveBeenCalled();
  });

  it("enables WAL mode on a disposable local SQLite database", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hangtime-db-init-wal-"));
    const database = createClient({ url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` });

    try {
      await initDatabase(database);
      const journalMode = await database.execute("PRAGMA journal_mode");
      expect(String(journalMode.rows[0]?.journal_mode)).toBe("wal");
    } finally {
      database.close();
    }
  });

  it("retries the idempotent brand migration when SQLite is busy", async () => {
    let brandAttempts = 0;
    const execute = vi.fn(async (statement: string) => {
      void statement;
      return { rows: [] };
    });
    const executeMultiple = vi.fn(async (sql: string) => {
      if (sql.includes("UPDATE recommendation_candidates")) {
        brandAttempts += 1;
        if (brandAttempts < 3) {
          const error = Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
          throw error;
        }
      }
    });
    const client = { execute, executeMultiple } as unknown as Client;

    await initDatabase(client, { applyLocalPragmas: false });

    expect(brandAttempts).toBe(3);
    expect(executeMultiple.mock.calls.filter(([sql]) => String(sql).includes("UPDATE recommendation_candidates"))).toHaveLength(3);
  });

  it("does not retry non-busy brand migration failures", async () => {
    let brandAttempts = 0;
    const execute = vi.fn(async (statement: string) => {
      void statement;
      return { rows: [] };
    });
    const executeMultiple = vi.fn(async (sql: string) => {
      if (sql.includes("UPDATE recommendation_candidates")) {
        brandAttempts += 1;
        throw new Error("brand migration failed");
      }
    });
    const client = { execute, executeMultiple } as unknown as Client;

    await expect(initDatabase(client, { applyLocalPragmas: false })).rejects.toThrow("brand migration failed");
    expect(brandAttempts).toBe(1);
  });
});
