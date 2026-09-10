import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("hermetic E2E runner environment", () => {
  it("forces a temporary local Turso database and removes remote/provider production state", () => {
    const runnerPath = path.resolve(import.meta.dirname, "../../scripts/run-hermetic-e2e.mjs");
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hangtime-hermetic-env-"));
    const baseEnvironment: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      TURSO_DATABASE_URL: "libsql://production.example",
      TURSO_AUTH_TOKEN: "remote-token",
      TURSO_PREVIEW_DATABASE_URL: "libsql://preview.example",
      TURSO_PREVIEW_AUTH_TOKEN: "preview-token",
      TURSO_PRODUCTION_DATABASE_URL: "libsql://production.example",
      TURSO_PRODUCTION_AUTH_TOKEN: "production-token",
      ONEMAP_EMAIL: "remote@example.com",
      ONEMAP_PASSWORD: "remote-password",
      GOOGLE_CALENDAR_CLIENT_SECRET: "google-secret",
      RESEND_API_KEY: "re_secret",
      VAPID_PRIVATE_KEY: "vapid-secret",
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_OIDC_TOKEN: "vercel-token",
      NODE_ENV: "production",
      RELEASE_CHANNEL: "production",
    };
    const probe = [
      `import { createHermeticEnvironment } from ${JSON.stringify(pathToFileURL(runnerPath).href)};`,
      `const env = createHermeticEnvironment(${JSON.stringify(baseEnvironment)}, ${JSON.stringify(tempRoot)}, "3214");`,
      "process.stdout.write(JSON.stringify(env));",
    ].join("\n");

    try {
      const output = execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
        encoding: "utf8",
        windowsHide: true,
      });
      const env = JSON.parse(output) as Record<string, string | undefined>;
      const databasePath = path.join(tempRoot, "uat.db");

      expect(env.DATABASE_URL).toBe(databasePath);
      expect(env.TURSO_DATABASE_URL).toBe(`file:${databasePath.replaceAll("\\", "/")}`);
      expect(env.TURSO_AUTH_TOKEN).toBe("");
      expect(env.HANGTIME_DEMO_MODE).toBe("true");
      expect(env.DINNER_TIME_DEMO_MODE).toBe("false");
      expect(env.AUTH_EMAIL_DRIVER).toBe("test");
      expect(env.AUTH_TEST_EMAIL_OUTBOX_PATH).toBe(path.join(tempRoot, "auth-email-outbox.jsonl"));

      for (const key of [
        "TURSO_PREVIEW_DATABASE_URL",
        "TURSO_PREVIEW_AUTH_TOKEN",
        "TURSO_PRODUCTION_DATABASE_URL",
        "TURSO_PRODUCTION_AUTH_TOKEN",
        "ONEMAP_EMAIL",
        "ONEMAP_PASSWORD",
        "GOOGLE_CALENDAR_CLIENT_SECRET",
        "RESEND_API_KEY",
        "VAPID_PRIVATE_KEY",
        "VERCEL",
        "VERCEL_ENV",
        "VERCEL_OIDC_TOKEN",
        "RELEASE_CHANNEL",
      ]) {
        expect(env[key]).toBe("");
      }
      expect(env.NODE_ENV).toBe("development");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps Vitest and production Playwright configuration on local databases", () => {
    const hostileEnvironment = {
      ...process.env,
      TURSO_DATABASE_URL: "libsql://production.example",
      TURSO_AUTH_TOKEN: "remote-token",
      DATABASE_URL: "libsql://also-remote.example",
      RESEND_API_KEY: "re_secret",
      VERCEL: "1",
      VERCEL_ENV: "production",
    };
    const importConfig = (configPath: string) => {
      const probe = [
        `const config = (await import(${JSON.stringify(pathToFileURL(configPath).href)})).default;`,
        "process.stdout.write(JSON.stringify(config));",
      ].join("\n");
      const output = execFileSync(process.execPath, ["--import", "tsx/esm", "--input-type=module", "-e", probe], {
        cwd: process.cwd(),
        env: hostileEnvironment,
        encoding: "utf8",
        windowsHide: true,
      });
      return JSON.parse(output) as Record<string, unknown>;
    };

    const vitestConfig = importConfig(path.resolve(import.meta.dirname, "../../vitest.config.ts"));
    const vitestTest = vitestConfig.test as { env: Record<string, string> };
    expect(vitestTest.env.TURSO_DATABASE_URL).toMatch(/^file:/);
    expect(vitestTest.env.TURSO_DATABASE_URL).not.toContain("libsql:");
    expect(vitestTest.env.TURSO_AUTH_TOKEN).toBe("");

    const productionConfig = importConfig(path.resolve(import.meta.dirname, "../../playwright.production.config.ts"));
    const productionWebServer = productionConfig.webServer as { env: Record<string, string | undefined> };
    expect(productionWebServer.env.TURSO_DATABASE_URL).toMatch(/^file:/);
    expect(productionWebServer.env.TURSO_DATABASE_URL).not.toContain("libsql:");
    expect(productionWebServer.env.TURSO_AUTH_TOKEN).toBe("");
    expect(productionWebServer.env.DATABASE_URL).toContain("hangtime-production-e2e-");
    expect(productionWebServer.env.DATABASE_URL).not.toContain("also-remote.example");
    expect(productionWebServer.env.RESEND_API_KEY).toBe("");
    expect(productionWebServer.env.VERCEL).toBe("");
    expect(productionWebServer.env.AUTH_SECRET).toBe("ci-only-hangtime-secret-000000000000000000");
    expect(productionWebServer.env.LOCATION_KEYRING_B64).toBeTruthy();
    expect(productionWebServer.env.AUTH_EMAIL_DRIVER).toBe("test");
    expect(productionWebServer.env.AUTH_TEST_EMAIL_OUTBOX_PATH).toContain("hangtime-production-e2e-");
    expect(productionWebServer.env.NODE_ENV).toBe("production");
  });

  it("keeps explicit child canaries ahead of dotenv values", () => {
    const runnerPath = path.resolve(import.meta.dirname, "../../scripts/run-hermetic-e2e.mjs");
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hangtime-dotenv-canary-"));
    fs.writeFileSync(path.join(tempRoot, ".env.local"), [
      "TURSO_DATABASE_URL=libsql://dotenv.example",
      "TURSO_AUTH_TOKEN=dotenv-token",
      "RESEND_API_KEY=dotenv-resend-secret",
      "NODE_ENV=production",
    ].join("\n"));
    const nextTarget = fs.realpathSync(path.resolve(process.cwd(), "node_modules/next"));
    const nextEnvPath = path.resolve(nextTarget, "../@next/env/dist/index.js");
    const baseEnvironment: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      TURSO_DATABASE_URL: "libsql://parent.example",
      TURSO_AUTH_TOKEN: "parent-token",
      RESEND_API_KEY: "parent-resend-secret",
      NODE_ENV: "production",
    };
    const probe = [
      `const nextEnv = await import(${JSON.stringify(pathToFileURL(nextEnvPath).href)});`,
      `const { createHermeticEnvironment } = await import(${JSON.stringify(pathToFileURL(runnerPath).href)});`,
      `const env = createHermeticEnvironment(${JSON.stringify(baseEnvironment)}, ${JSON.stringify(tempRoot)}, "3215");`,
      "Object.assign(process.env, env);",
      `const loadEnvConfig = nextEnv.default?.loadEnvConfig ?? nextEnv.loadEnvConfig; loadEnvConfig(${JSON.stringify(tempRoot)}, false);`,
      "process.stdout.write(JSON.stringify({ TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL, TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN, RESEND_API_KEY: process.env.RESEND_API_KEY, NODE_ENV: process.env.NODE_ENV }));",
    ].join("\n");

    try {
      const output = execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
        cwd: process.cwd(),
        env: baseEnvironment,
        encoding: "utf8",
        windowsHide: true,
      });
      expect(JSON.parse(output)).toEqual({
        TURSO_DATABASE_URL: `file:${path.join(tempRoot, "uat.db").replaceAll("\\", "/")}`,
        TURSO_AUTH_TOKEN: "",
        RESEND_API_KEY: "",
        NODE_ENV: "development",
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
