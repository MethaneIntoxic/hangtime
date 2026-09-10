import { defineConfig } from "vitest/config";
import os from "node:os";
import path from "node:path";

const runtimeDatabasePath = path.join(os.tmpdir(), `hangtime-vitest-runtime-${process.pid}.db`);

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
    passWithNoTests: false,
    fileParallelism: false,
    env: {
      DATABASE_URL: runtimeDatabasePath,
      TURSO_DATABASE_URL: `file:${runtimeDatabasePath.replaceAll("\\", "/")}`,
      TURSO_AUTH_TOKEN: "",
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
