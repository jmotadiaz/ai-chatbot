/**
 * ISOMORPHIC public surface of the `config` package (ADR 0011).
 *
 * Everything that code compiled by Next.js (server or client) and the tests may
 * import: types, Gateway contract constants, portable paths, guardrails,
 * `ConfigError` and the facade factory.
 *
 * It does NOT include the selector (`initConfig`, argv parsing, `envBundlePath`): that
 * module imports the three `env.<env>.ts` bundles and cannot be part of them
 * without a cycle. The bundles re-export this surface so that the bundler alias
 * (`"config"` → `env.<env>.ts`) keeps the full API.
 */

export { ConfigError } from "./errors";
export {
  createConfigFacade,
  getBuildFlags,
  optional,
  resetBuildFlagsForTests,
  setBuildFlags,
} from "./facade";
export type { BuildFlags, ConfigFacade } from "./facade";
export {
  EMBEDDING_DIMENSIONS,
  GATEWAY_THINKING_LEVELS,
} from "./gateway-contract";
export type {
  GatewayModelCost,
  GatewayModelEntry,
  ThinkingLevel,
} from "./gateway-contract";
export {
  assertDatabaseMatchesEnvironment,
  assertGatewayMatchesEnvironment,
  ENVIRONMENT_DSN,
  ENVIRONMENT_GATEWAY_PORT,
  validateAppConfig,
} from "./guardrails";
export {
  homePath,
  normalizePath,
  packagePath,
  REPO_ROOT,
  repoPath,
  resolvePath,
} from "./paths";
export type { PackageName } from "./paths";
export type {
  AppConfig,
  Environment,
  SecretsConfig,
  StructuralConfig,
} from "./types";
