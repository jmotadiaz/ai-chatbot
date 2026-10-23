/**
 * Superficie pública ISOMORFA del paquete `config` (ADR 0011).
 *
 * Todo lo que puede importar código compilado por Next.js (servidor o
 * cliente) y los tests: tipos, constantes del contrato del Gateway, rutas
 * portables, guardarraíles, `ConfigError` y la fábrica de la fachada.
 *
 * NO incluye el selector (`initConfig`, parseo de argv, `envBundlePath`): ese
 * módulo importa los tres bundles `env.<env>.ts` y no puede formar parte de
 * ellos sin un ciclo. Los bundles re-exportan esta superficie para que el
 * alias del bundler (`"config"` → `env.<env>.ts`) mantenga la API completa.
 */

export {
  detectTestRunner,
  ENTORNOS,
  envBundlePath,
  parseBuildFlagsFromArgv,
  parseEntornoFromArgv,
} from "./argv";
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
  assertDbMatchesEntorno,
  assertGatewayMatchesEntorno,
  ENTORNO_DB,
  ENTORNO_GATEWAY_PORT,
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
  Entorno,
  SecretsConfig,
  StructuralConfig,
} from "./types";
