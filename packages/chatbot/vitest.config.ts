import path from "path";
import { configDefaults, defineConfig } from "vitest/config";
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
 * `initConfig("test")` when this file loads (main process), never an inherited
 * environment variable.
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
 * EXECUTION PROFILES (ADR 0013, spec §6). This file is the DEFAULT profile:
 * unit, component, integration and contract, all self-contained. Inference is
 * substituted at the Model Gateway HTTP seam with MSW
 * (`tests/helpers/gateway-harness.ts`) and persistence with in-memory PGlite
 * (`tests/helpers/db-setup.ts`), so nothing listens on a port and no
 * PostgreSQL container is required. Tests that genuinely need a provisioned
 * resource are listed in `INFRA_TESTS` and excluded here; the infrastructure
 * profile (`vitest.infra.config.ts`, `pnpm test:infra`) runs them. That profile
 * is not a category of its own: the selected tests keep the directory that
 * expresses their scope (`tests/integration/...`) and only their execution
 * differs.
 */
initConfig("test");

/**
 * Tests that need a PROVISIONED resource rather than an in-process substitute:
 * they open a real listening socket (or need external PostgreSQL) instead of
 * intercepting HTTP with MSW. Today the only member is the consumer-owned Mock
 * Model Gateway harness test, which binds the canonical `:4001` of the Test
 * Environment (the frozen bundle cannot point anywhere else).
 *
 * Add a pattern here only for a test that genuinely cannot run in-process.
 * Everything else belongs to the default profile below.
 */
export const INFRA_TESTS = ["tests/integration/mocks/**/*.test.ts"];

/** Default (self-contained) profile: every suite tied to a package boundary. */
const DEFAULT_TESTS = [
  "tests/unit/**/*.test.ts",
  "tests/unit/**/*.test.tsx",
  "tests/component/**/*.test.ts",
  "tests/component/**/*.test.tsx",
  "tests/integration/**/*.test.ts",
  "tests/integration/**/*.test.tsx",
  "tests/contract/**/*.test.ts",
  "tests/contract/**/*.test.tsx",
];

/**
 * Resolution shared by both profiles. `__dirname` is this package's root, so it
 * stays correct when `vitest.infra.config.ts` imports these values.
 */
export const sharedResolve = {
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
};

/** Test-runner settings shared by both profiles (selection excluded). */
export const sharedTest = {
  environment: "node" as const,
  // React 19 only exports `act` from its development build; force test
  // mode so the suite is not affected by an ambient NODE_ENV=production.
  env: {
    NODE_ENV: "test" as const,
  },
  // jsdom test files need a Web Storage implementation: Node 26 exposes an
  // unconfigured `localStorage` global, which makes vitest's jsdom
  // environment skip jsdom's own. See tests/helpers/web-storage-setup.ts.
  setupFiles: ["./tests/helpers/web-storage-setup.ts"],
  clearMocks: true,
  restoreMocks: true,
};

export default defineConfig({
  resolve: sharedResolve,
  test: {
    ...sharedTest,
    include: DEFAULT_TESTS,
    exclude: [...configDefaults.exclude, ...INFRA_TESTS],
  },
});
