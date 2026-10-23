import { ConfigError } from "./errors";
import { packagePath } from "./paths";
import type { Environment } from "./types";

/**
 * Parsing of `process.argv` (ADR 0011 §3.5) and the path of the Environment bundle.
 *
 * This module does NOT import the `env.<env>.ts` bundles, so it is part of the
 * isomorphic surface (`surface.ts`) and the Environment bundles re-export it:
 * the scripts and configs loaded in the SAME process as the alias
 * (`next.config.ts`, `scripts/next-cli.ts` under vitest) still see these
 * functions even when `"config"` is bound to `env.<environment>.ts`.
 */

export const ENVIRONMENTS: readonly Environment[] = ["prod", "dev", "test"];

export function isEnvironment(value: string): value is Environment {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * Environment declared with `--env=<environment>` (or `--env <environment>`). Returns
 * `undefined` if the flag is absent; throws `ConfigError` if the value is not valid
 * — a misspelled flag must NEVER silently fall back to the default Environment.
 */
export function parseEnvironmentFromArgv(
  argv: readonly string[] = process.argv,
): Environment | undefined {
  let found: Environment | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    let raw: string | undefined;
    if (arg === "--env") raw = argv[index + 1];
    else if (arg.startsWith("--env=")) raw = arg.slice("--env=".length);
    if (raw === undefined) continue;
    if (!isEnvironment(raw)) {
      throw new ConfigError(
        "--env",
        `invalid value "${raw}"; expected --env=prod|dev|test`,
      );
    }
    found = raw;
  }
  return found;
}

/** Build flags present in argv (`--verify`, `--allow-prod-build`). */
export function parseBuildFlagsFromArgv(argv: readonly string[] = process.argv): {
  verifyBuild: boolean;
  allowProdBuild: boolean;
} {
  return {
    verifyBuild: argv.includes("--verify"),
    allowProdBuild: argv.includes("--allow-prod-build"),
  };
}

/**
 * Automatic test-runner detection: `npx vitest` or `npx playwright` launched by
 * hand from any cwd must also ALWAYS run in test.
 * (The `vitest.config.ts` files also call `initConfig("test")`: Vitest workers
 * do not keep the binary's argv, so this detection is a safety net for the
 * main process.)
 */
export function detectTestRunner(argv: readonly string[] = process.argv): Environment | undefined {
  const isRunner = argv.some((arg) => {
    const normalized = arg.replace(/\\/g, "/");
    return (
      /(^|\/)vitest(\.mjs|\.js)?$/.test(normalized) ||
      normalized.includes("@playwright/test") ||
      /(^|\/)playwright(\.mjs|\.js)?$/.test(normalized)
    );
  });
  return isRunner ? "test" : undefined;
}

/**
 * Path of the Environment module. Consumed by `next.config.ts` (Turbopack/Webpack
 * alias) and by the `vitest.config.ts` files to bind `"config"` to the static
 * bundle without reading `process.env`.
 */
export function envBundlePath(environment: Environment): string {
  return packagePath("config", "src", `env.${environment}.ts`);
}
