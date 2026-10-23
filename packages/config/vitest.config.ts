import { defineConfig } from "vitest/config";
import { initConfig } from "./src/config";

/**
 * The `config` package tests ALWAYS run in the Test Environment
 * (ADR 0011 §3.5): initialization is explicit when this file loads, not
 * an environment variable a shell could drag along.
 */
initConfig("test");

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
