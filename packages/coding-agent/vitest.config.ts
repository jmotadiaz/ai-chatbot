import path from "node:path";
import { defineConfig } from "vitest/config";
import { initConfig } from "../config/src/config";

/**
 * The Coding Agent Worker tests ALWAYS run in the Test Environment
 * (ADR 0011): initialization is explicit when this file loads, never an
 * environment variable inherited from the parent worker.
 *
 * One test category (ADR 0013): every self-contained test is a unit test under
 * `tests/unit/`, organized by capability. RPC contract checks and rendered
 * tests without a real browser are unit tests; the package has no E2E suite
 * (Playwright lives in `packages/chatbot`).
 *
 * The `"config"` alias binds the package to the static bundle `env.test.ts`
 * (which re-exports the package's full isomorphic surface plus the facade
 * wired to the Environment), the same module the Next.js bundler would wire in
 * a test build: a test cannot observe secrets or dev/prod paths.
 */
initConfig("test");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^config$/,
        replacement: path.resolve(__dirname, "../config/src/env.test.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
    },
    include: ["tests/unit/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
