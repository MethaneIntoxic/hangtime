import type { Client } from "@libsql/client";
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
    ]));
  });

  it("skips unsupported connection pragmas for remote Turso migrations", async () => {
    const database = fakeClient();

    await initDatabase(database.client, { applyLocalPragmas: false });

    const statements = database.execute.mock.calls.map(([statement]) => String(statement));
    expect(statements).not.toEqual(expect.arrayContaining([
      "PRAGMA busy_timeout = 10000",
      "PRAGMA foreign_keys = ON",
    ]));
    expect(database.executeMultiple).toHaveBeenCalled();
  });
});
