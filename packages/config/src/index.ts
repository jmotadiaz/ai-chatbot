export { ConfigError } from "./errors";
export { config, optional } from "./config";
export { createConfigFacade } from "./facade";
export type { ConfigFacade } from "./facade";
export {
  getBuildFlags,
  resetBuildFlagsForTests,
  setBuildFlags,
} from "./facade";
export type { BuildFlags } from "./facade";
export {
  detectTestRunner,
  ENTORNOS,
  envBundlePath,
  initConfig,
  parseBuildFlagsFromArgv,
  parseEntornoFromArgv,
  resetConfigForTests,
} from "./config";
export type { InitConfigOptions } from "./config";
export {
  assertDbMatchesEntorno,
  assertGatewayMatchesEntorno,
  ENTORNO_DB,
  ENTORNO_GATEWAY_PORT,
  validateAppConfig,
} from "./guardrails";
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
