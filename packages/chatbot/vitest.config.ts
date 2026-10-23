import path from "path";
import { defineConfig } from "vitest/config";
import { initConfig } from "../config/src/config";

// `NODE_ENV=test` must be set BEFORE Vite resolves the graph: without
// it, the tests using `@vitest-environment jsdom` that import `node:*` modules
// (or React 19, which only exports `act` in development) fail at collection with
// "No such built-in module: node:". It is a variable managed by the runner
// (framework), not app configuration: the Environment is set by `initConfig`.
// Next declares `process.env.NODE_ENV` as readonly; the runner needs to
// actually set it (not just in the tests' `env`).
(process.env as Record<string, string | undefined>).NODE_ENV = "test";

/**
 * The chatbot's tests ALWAYS run in the Test Environment (ADR 0011):
 * `initConfig("test")` when this file loads (main process — the same one
 * that runs `globalSetup`), never an inherited environment variable.
 *
 * The `"config"` alias binds the package to the static bundle
 * `packages/config/src/env.test.ts` (it re-exports the full isomorphic surface
 * and pins the facade to test's frozen bundle): Vitest's workers do
 * NOT re-evaluate this config nor keep the binary's argv, so
 * without the alias `config`'s selector would fail (`Missing required CLI flag
 * --env`) in every worker. With the alias, each worker imports the
 * static test bundle directly — the same module `next.config.ts` would weld in
 * a test build — and a test cannot observe dev/prod secrets or paths.
 *
 * `globalSetup` brings up the Mock Model Gateway on the canonical port `:4001`
 * (`config.modelGatewayUrl()` in test) in the main process, with teardown;
 * it used to live in `setupFiles` as a per-worker server with an ephemeral port
 * mutating `process.env.MODEL_GATEWAY_URL` — a mutation the frozen bundle
 * ignores (and which also dragged `node:http` into the jsdom workers).
 */
initConfig("test");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^config$/,
        replacement: path.resolve(__dirname, "../config/src/env.test.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "."),
      },
      {
        find: "server-only",
        replacement: path.resolve(__dirname, "./tests/mocks/server-only.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    // React 19 only exports `act` from its development build; force test
    // mode so the suite is not affected by an ambient NODE_ENV=production.
    env: {
      NODE_ENV: "test",
    },
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/component/**/*.test.ts",
      "tests/component/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
      "tests/integration/**/*.test.tsx",
      "tests/contract/**/*.test.ts",
      "tests/contract/**/*.test.tsx",
    ],
    // jsdom test files need a Web Storage implementation: Node 26 exposes an
    // unconfigured `localStorage` global, which makes vitest's jsdom
    // environment skip jsdom's own. See tests/helpers/web-storage-setup.ts.
    globalSetup: ["./tests/helpers/mock-gateway-global-setup.ts"],
    setupFiles: ["./tests/helpers/web-storage-setup.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
