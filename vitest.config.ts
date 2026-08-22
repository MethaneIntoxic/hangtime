import { defineConfig } from "vitest/config";
import os from "node:os";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
    passWithNoTests: false,
    fileParallelism: false,
    env: {
      DATABASE_URL: path.join(os.tmpdir(), `hangtime-vitest-runtime-${process.pid}.db`),
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
