import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { initDatabase } from "@/lib/db/init";
import { consumeMagicLink, deleteExpiredAuthRecords, issueMagicLink } from "@/lib/auth/magic-link";
import {
  productionSessionUserId,
  revokeProductionSession,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/auth/production-session";
import {
  consumeRateLimit,
  isAllowedRequestOrigin,
  normalizeEmail,
  safeInternalReturnTo,
} from "@/lib/auth/request-security";

const temporaryDirectories: string[] = [];

async function temporaryDatabase(): Promise<Client> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hangtime-auth-libsql-"));
  temporaryDirectories.push(directory);
  const database = createClient({ url: `file:${path.join(directory, "auth.db").replaceAll("\\", "/")}` });
  await initDatabase(database);
  return database;
}

afterEach(() => {
  // libSQL's Windows native driver can retain a file handle until process exit.
  // Use OS temp storage and forget paths here; the OS can reclaim them safely.
  temporaryDirectories.splice(0);
});

describe("production magic-link authentication", () => {
  const nowMs = Date.UTC(2026, 7, 20, 10, 0, 0);

  it("normalizes an email and provisions a location-free profile", async () => {
    const database = await temporaryDatabase();
    const issued = await issueMagicLink("  New.User@Example.COM ", database, nowMs);
    expect(issued.email).toBe("new.user@example.com");

    const result = await consumeMagicLink(issued.token, database, nowMs + 1_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const profile = (await database.execute({
      sql: `SELECT email, display_name AS displayName FROM profiles WHERE id = ?`,
      args: [result.userId],
    })).rows[0];
    expect(profile).toMatchObject({
      email: "new.user@example.com",
      displayName: "New User",
    });
    const profileColumns = (await database.execute("PRAGMA table_info(profiles)")).rows;
    expect(profileColumns.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(["postal_code", "lat", "lng"]),
    );
    expect(await productionSessionUserId(result.session.token, database, nowMs + 2_000)).toBe(
      result.userId,
    );
    database.close();
  });

  it("allows exactly one consumption and rejects expired links", async () => {
    const database = await temporaryDatabase();
    const issued = await issueMagicLink("person@example.com", database, nowMs);
    expect((await consumeMagicLink(issued.token, database, nowMs + 1_000)).ok).toBe(true);
    expect(await consumeMagicLink(issued.token, database, nowMs + 2_000)).toEqual({
      ok: false,
      code: "LINK_ALREADY_USED",
    });

    const expired = await issueMagicLink("other@example.com", database, nowMs);
    expect(await consumeMagicLink(expired.token, database, nowMs + 16 * 60 * 1_000)).toEqual({
      ok: false,
      code: "INVALID_OR_EXPIRED_LINK",
    });
    database.close();
  });

  it("allows only one of two concurrent consumers to create a session", async () => {
    const database = await temporaryDatabase();
    const issued = await issueMagicLink("race@example.com", database, nowMs);
    const results = await Promise.all([
      consumeMagicLink(issued.token, database, nowMs + 1_000),
      consumeMagicLink(issued.token, database, nowMs + 1_000),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const sessions = await database.execute("SELECT COUNT(*) AS count FROM auth_sessions");
    expect(Number(sessions.rows[0].count)).toBe(1);
    database.close();
  });

  it("revokes an opaque session immediately", async () => {
    const database = await temporaryDatabase();
    const issued = await issueMagicLink("person@example.com", database, nowMs);
    const result = await consumeMagicLink(issued.token, database, nowMs + 1_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await revokeProductionSession(result.session.token, database, nowMs + 2_000);
    expect(await productionSessionUserId(result.session.token, database, nowMs + 3_000)).toBeNull();
    database.close();
  });

  it("removes expired links whether or not they were consumed", async () => {
    const database = await temporaryDatabase();
    await issueMagicLink("unused@example.com", database, nowMs);
    const consumed = await issueMagicLink("used@example.com", database, nowMs);
    expect((await consumeMagicLink(consumed.token, database, nowMs + 1_000)).ok).toBe(true);

    await deleteExpiredAuthRecords(database, nowMs + 16 * 60 * 1_000);

    const remaining = await database.execute("SELECT COUNT(*) AS count FROM auth_magic_links");
    expect(Number(remaining.rows[0].count)).toBe(0);
    database.close();
  });
});

describe("authentication request protections", () => {
  it("accepts only the configured production origin", () => {
    const allowed = new Request("https://hangtime.example/api", {
      method: "POST",
      headers: { origin: "https://hangtime.example" },
    });
    const rejected = new Request("https://hangtime.example/api", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    const env = { NODE_ENV: "production", APP_URL: "https://hangtime.example" } as NodeJS.ProcessEnv;
    expect(isAllowedRequestOrigin(allowed, env)).toBe(true);
    expect(isAllowedRequestOrigin(rejected, env)).toBe(false);
    expect(isAllowedRequestOrigin(new Request("https://hangtime.example/api"), env)).toBe(false);
  });

  it("rejects external return destinations", () => {
    expect(safeInternalReturnTo("/plans/abc?tab=voting")).toBe("/plans/abc?tab=voting");
    expect(safeInternalReturnTo("//evil.example/path")).toBe("/");
    expect(safeInternalReturnTo("https://evil.example/path")).toBe("/");
    expect(normalizeEmail(" Person@Example.COM ")).toBe("person@example.com");
  });

  it("enforces an atomic persistent rate limit", async () => {
    const database = await temporaryDatabase();
    const input = {
      scope: "auth-email",
      value: "person@example.com",
      limit: 2,
      windowSeconds: 3_600,
      secret: "test-secret-at-least-thirty-two-characters",
      nowMs: Date.UTC(2026, 7, 20, 10, 0, 0),
    };
    expect(await consumeRateLimit(database, input)).toBe(true);
    expect(await consumeRateLimit(database, input)).toBe(true);
    expect(await consumeRateLimit(database, input)).toBe(false);
    database.close();
  });

  it("counts concurrent rate-limit attempts without lost updates", async () => {
    const database = await temporaryDatabase();
    const input = {
      scope: "auth-client",
      value: "203.0.113.10",
      limit: 4,
      windowSeconds: 3_600,
      secret: "test-secret-at-least-thirty-two-characters",
      nowMs: Date.UTC(2026, 7, 20, 10, 0, 0),
    };
    const allowed = await Promise.all(
      Array.from({ length: 8 }, () => consumeRateLimit(database, input)),
    );
    expect(allowed.filter(Boolean)).toHaveLength(4);
    const count = await database.execute("SELECT attempt_count AS count FROM auth_rate_limits");
    expect(Number(count.rows[0].count)).toBe(8);
    database.close();
  });

  it("isolates rate-limit buckets by scope, value, and window", async () => {
    const database = await temporaryDatabase();
    const base = {
      value: "person@example.com",
      limit: 1,
      windowSeconds: 60,
      secret: "test-secret-at-least-thirty-two-characters",
      nowMs: Date.UTC(2026, 7, 20, 10, 0, 0),
    };

    expect(await consumeRateLimit(database, { ...base, scope: "auth-email" })).toBe(true);
    expect(await consumeRateLimit(database, { ...base, scope: "auth-email" })).toBe(false);
    // A different scope must not inherit the email bucket.
    expect(await consumeRateLimit(database, { ...base, scope: "auth-client" })).toBe(true);
    // A different identity must not inherit either bucket.
    expect(await consumeRateLimit(database, { ...base, scope: "auth-email", value: "other@example.com" })).toBe(true);
    // Once the fixed window rolls over, the original identity can try again.
    expect(await consumeRateLimit(database, {
      ...base,
      scope: "auth-email",
      nowMs: base.nowMs + 60_000,
    })).toBe(true);
    database.close();
  });

  it("expires an opaque session at the strict TTL boundary", async () => {
    const database = await temporaryDatabase();
    const sessionNowMs = Date.UTC(2026, 7, 20, 10, 0, 0);
    const issued = await issueMagicLink("boundary@example.com", database, sessionNowMs);
    const consumed = await consumeMagicLink(issued.token, database, sessionNowMs + 1_000);
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;

    const expiresAt = Date.parse(consumed.session.expiresAt);
    expect(await productionSessionUserId(consumed.session.token, database, expiresAt - 1)).toBe(consumed.userId);
    expect(await productionSessionUserId(consumed.session.token, database, expiresAt)).toBeNull();
    database.close();
  });

  it("uses a secure host-only cookie in production", () => {
    const production = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
    expect(sessionCookieName(production)).toBe("__Host-hangtime_session");
    expect(sessionCookieOptions(production)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });
});
