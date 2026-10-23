import {
  detectTestRunner,
  isEnvironment,
  parseBuildFlagsFromArgv,
  parseEnvironmentFromArgv,
} from "./argv";
import { ConfigError } from "./errors";
import { envDev } from "./env.dev";
import { envProd } from "./env.prod";
import { envTest } from "./env.test";
import { createConfigFacade, setBuildFlags } from "./facade";
import type { AppConfig, Environment } from "./types";

/**
 * Environment selector and `config` facade (ADR 0011 §3.5).
 *
 * The active Environment is resolved WITHOUT reading any `process.env` variable:
 *
 * 1. `initConfig(environment, options?)` — explicit in-memory initialization.
 *    Used by `vitest.config.ts`, `playwright.config.ts` and `scripts/next-cli.ts`.
 * 2. `--env=prod|dev|test` in `process.argv`. Unlike an environment variable,
 *    `process.argv` belongs ONLY to the invoked process: the kernel does not
 *    propagate it across `fork()`/`execve()`, so no subprocess spawned by the
 *    Coding Agent Worker (e.g. `pnpm test`) can inherit the parent worker's
 *    Environment. Hence the incident that motivates ADR 0011.
 * 3. Test-runner detection in `process.argv` (`vitest`, `@playwright/test`).
 * 4. Fast-fail `ConfigError`.
 *
 * The `env.<env>.ts` bundles are frozen and validated by the coherence
 * guardrails. In Next.js the `"config"` import is replaced at compile time by
 * the bundle of its Environment (`next.config.ts` → `resolveAlias`), so the
 * compiled code does not depend on this selector.
 */

const BUNDLES: Record<Environment, AppConfig> = {
  prod: envProd,
  dev: envDev,
  test: envTest,
};

export interface InitConfigOptions {
  /** `build:verify`: isolates the compilation artifacts (`.next/verify`, `.pi-verify`). */
  verifyBuild?: boolean;
  /** `build`: explicit operator/CI opt-in to overwrite the prod artifacts. */
  allowProdBuild?: boolean;
  /** argv to parse (defaults to `process.argv`); injectable in tests. */
  argv?: readonly string[];
}

let activeBundle: AppConfig | undefined;

/**
 * Sets the active Environment in memory. The last explicit initialization wins
 * (tests may re-initialize). It also sets the build flags, which the static
 * bundle bound by the bundler reads through `facade.ts`.
 */
export function initConfig(environment: Environment, options: InitConfigOptions = {}): void {
  if (!isEnvironment(environment)) {
    throw new ConfigError("initConfig", `invalid Environment "${String(environment)}"`);
  }
  const argv = options.argv ?? process.argv;
  const flags = parseBuildFlagsFromArgv(argv);
  setBuildFlags({
    verifyBuild: options.verifyBuild ?? flags.verifyBuild,
    allowProdBuild: options.allowProdBuild ?? flags.allowProdBuild,
  });
  activeBundle = BUNDLES[environment];
}

/** Test hook: forgets the active Environment so it is resolved from argv again. */
export function resetConfigForTests(): void {
  activeBundle = undefined;
}

function resolveBundle(): AppConfig {
  if (activeBundle) return activeBundle;
  const argv = process.argv;
  const environment = parseEnvironmentFromArgv(argv) ?? detectTestRunner(argv);
  if (!environment) {
    throw new ConfigError(
      "--env",
      "Missing required CLI flag --env=prod|dev|test " +
        "(process.argv is the only environment selector; see ADR 0011)",
    );
  }
  initConfig(environment, { argv });
  if (!activeBundle) {
    throw new ConfigError("--env", "the active Environment could not be resolved");
  }
  return activeBundle;
}

/**
 * Frozen functional facade of the active Environment: it keeps the historical
 * API (`config.postgresUrl()`, `config.codingAgentAuthJson()`, …) on top of the
 * bundle resolved by `initConfig()`/`--env`, so the ~50 call sites in the
 * monorepo do not change.
 */
export const config = createConfigFacade(resolveBundle);
