import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const validKeyring = Buffer.from(JSON.stringify({
  active: "v1",
  keys: { v1: Buffer.alloc(32, 7).toString("base64url") },
})).toString("base64url");

function validate(overrides: Record<string, string | undefined> = {}) {
  const env = {
    ...process.env,
    CI: "true",
    NODE_ENV: "production",
    HANGTIME_DEMO_MODE: "false",
    TURSO_DATABASE_URL: "libsql://hangtime-production.turso.io",
    TURSO_AUTH_TOKEN: "test_turso_token_long_enough_for_validation",
    APP_URL: "https://hangtime.example",
    AUTH_SECRET: "production-auth-secret-with-at-least-32-characters",
    RELEASE_CHANNEL: "production",
    AUTH_EMAIL_DRIVER: "resend",
    RESEND_API_KEY: "re_test_key_long_enough_for_validation",
    AUTH_EMAIL_FROM: "Hangtime <sign-in@hangtime.example>",
    LOCATION_KEYRING_B64: validKeyring,
    ...overrides,
  } as NodeJS.ProcessEnv;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
  }
  return spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "validate-production-env.mjs")], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
}

describe("production environment controls", () => {
  it("refuses a Vercel runtime without remote Turso credentials", () => {
    const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    const result = spawnSync(process.execPath, [tsx, "-e", "import('./src/lib/db/index.ts')"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        VERCEL: "1",
        TURSO_DATABASE_URL: "",
        TURSO_AUTH_TOKEN: "",
      },
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("TURSO_DATABASE_URL is required on Vercel");
  });

  it("accepts concrete email and encryption controls without readiness booleans", () => {
    const result = validate({
      PRODUCTION_AUTH_READY: undefined,
      LOCATION_ENCRYPTION_READY: undefined,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PRODUCTION_ENV_CHECK_PASS channel=production");
  });

  it("fails closed when the location keyring is missing or malformed", () => {
    const missing = validate({ LOCATION_KEYRING_B64: undefined });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("LOCATION_KEYRING_B64");

    const malformed = validate({ LOCATION_KEYRING_B64: "not-a-keyring" });
    expect(malformed.status).toBe(1);
    expect(malformed.stderr).toContain("LOCATION_KEYRING_B64");
  });

  it("fails closed when production email delivery is not configured", () => {
    const result = validate({ RESEND_API_KEY: undefined });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("RESEND_API_KEY");
  });

  it("rejects malformed application origins and sender identities outside synthetic CI", () => {
    const pathUrl = validate({ CI: "false", APP_URL: "https://hangtime.sg/path" });
    expect(pathUrl.status).toBe(1);
    expect(pathUrl.stderr).toContain("APP_URL");

    const reserved = validate({ CI: "false", APP_URL: "https://hangtime.invalid" });
    expect(reserved.status).toBe(1);
    expect(reserved.stderr).toContain("APP_URL");

    const sender = validate({
      CI: "false",
      APP_URL: "https://hangtime.sg",
      AUTH_EMAIL_FROM: "not-an-email",
    });
    expect(sender.status).toBe(1);
    expect(sender.stderr).toContain("AUTH_EMAIL_FROM");
  });
});
