import { configDefaults, defineConfig } from "vitest/config";
// Importing the default config also runs its `initConfig("test")`: the infra
// profile is the same Test Environment, only a different test selection. The
// shared values are re-used instead of merged (`mergeConfig` concatenates
// `include`/`exclude` arrays, which would run every suite instead of selecting).
import { INFRA_TESTS, sharedResolve, sharedTest } from "./vitest.config";

/**
 * INFRASTRUCTURE execution profile (ADR 0013, spec §6).
 *
 * Runs exactly the chatbot tests that need a provisioned resource — today the
 * Mock Model Gateway harness test, which binds the canonical `:4001` instead of
 * intercepting HTTP with MSW (see `INFRA_TESTS` in `vitest.config.ts`). The
 * default profile (`pnpm test:unit`, `vitest.config.ts`) excludes them, so it
 * stays self-contained; this profile re-enables them with the default profile's
 * aliases, Environment and hooks unchanged.
 *
 * The profile does not bring infrastructure up: the selected tests own the
 * resources they need (the mock gateway test self-ensures the server it binds).
 * A future test with an external PostgreSQL requirement would be selected here
 * too, and then running this profile would mean providing that database first.
 *
 * Selection is by test file, never by an environment variable (ADR 0011).
 */
export default defineConfig({
  resolve: sharedResolve,
  test: {
    ...sharedTest,
    include: INFRA_TESTS,
    exclude: configDefaults.exclude,
  },
});
