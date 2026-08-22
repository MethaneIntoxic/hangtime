import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { initDatabase } from "./init";
import path from "node:path";
import fs from "node:fs";

// Next evaluates route modules while collecting build metadata. That phase must
// never inspect or mutate the operator's configured database; runtime startup
// remains responsible for validating the durable database and migrations.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const configuredLocalUrl = process.env.DATABASE_URL?.trim();
const localPath = path.resolve(
  /* turbopackIgnore: true */
  configuredLocalUrl || path.join(process.cwd(), "data", "dinner-time.db"),
);
if (!isBuild && !process.env.TURSO_DATABASE_URL) {
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
}
const databaseUrl = isBuild
  ? "file::memory:"
  : process.env.TURSO_DATABASE_URL?.trim()
    || (configuredLocalUrl?.startsWith("file:")
      ? configuredLocalUrl
      : `file:${localPath.replaceAll("\\", "/")}`);

if (!isBuild && process.env.VERCEL === "1" && !process.env.TURSO_DATABASE_URL?.trim()) {
  throw new Error("TURSO_DATABASE_URL is required on Vercel; local database fallback is disabled.");
}
if (databaseUrl.startsWith("libsql:") && !process.env.TURSO_AUTH_TOKEN?.trim()) {
  throw new Error("TURSO_AUTH_TOKEN is required for a remote Turso database.");
}

// Global cached client for Next.js hot-reload
const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof createClient> | undefined;
};

const client = globalForDb.client ?? createClient({
  url: databaseUrl,
  authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
});

// Runtime schema mutation is unsafe in serverless. Local development and test
// databases may bootstrap themselves; remote databases are migrated explicitly.
if (!isBuild && databaseUrl.startsWith("file:")) {
  await initDatabase(client);
}

if (process.env.NODE_ENV !== "production") {
  globalForDb.client = client;
}

export const db = drizzle(client, { schema });
export { client, schema };
