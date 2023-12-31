import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    setupFiles: ["test/setup-env.ts"],
    // DB-backed test files share one database; run files one at a time.
    fileParallelism: false,
  },
});
