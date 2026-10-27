import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    globalSetup: "./tests/integration/global-setup.ts",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
