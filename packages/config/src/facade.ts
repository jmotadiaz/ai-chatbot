import { packagePath } from "./paths";
import type { AppConfig, Environment } from "./types";

/**
 * Build flags (ADR 0006) shared by the `config.ts` selector and by the
 * `env.<env>.ts` bundles.
 *
 * `--verify` and `--allow-prod-build` do not choose an Environment: they adjust
 * the artifacts the build writes. They live in module state so that the static
 * bundle to which the Next.js bundler redirects `"config"` (which cannot
 * re-run `initConfig`) sees them: `scripts/next-cli.ts` calls `initConfig()` in
 * the SAME process that evaluates `next.config.ts`.
 */
export interface BuildFlags {
  readonly verifyBuild: boolean;
  readonly allowProdBuild: boolean;
}

let flags: BuildFlags = { verifyBuild: false, allowProdBuild: false };

export function setBuildFlags(next: Partial<BuildFlags>): void {
  flags = {
    verifyBuild: next.verifyBuild ?? flags.verifyBuild,
    allowProdBuild: next.allowProdBuild ?? flags.allowProdBuild,
  };
}

export function getBuildFlags(): BuildFlags {
  return flags;
}

/** Test hook: restores the default flags. */
export function resetBuildFlagsForTests(): void {
  flags = { verifyBuild: false, allowProdBuild: false };
}

/**
 * Frozen functional facade over an Environment bundle (ADR 0011).
 *
 * It keeps the historical API (`config.postgresUrl()`, `config.codingAgentAuthJson()`,
 * …) so the ~50 call sites in the monorepo do not change. Each method resolves
 * the bundle at call time: in `env.<env>.ts` it is a fixed value; in the
 * `config.ts` selector it is the active Environment.
 */
export function createConfigFacade(resolveBundle: () => AppConfig) {
  const value = <K extends keyof AppConfig>(key: K): AppConfig[K] => resolveBundle()[key];

  return Object.freeze({
    environment: (): Environment => value("environment"),

    // --- chatbot ---
    port: (): number => value("port"),
    modelGatewayUrl: (): string => value("modelGatewayUrl"),
    modelGatewayApiKey: (): string => value("modelGatewayApiKey"),
    postgresUrl: (): string => value("postgresUrl"),
    authSecret: (): string => value("authSecret"),
    exaSearchApiKey: (): string | undefined => value("exaSearchApiKey"),
    exaApiKey: (): string | undefined => value("exaApiKey"),
    mcpApiKey: (): string | undefined => value("mcpApiKey"),
    codingAgentEnabled: (): boolean => value("codingAgentEnabled"),
    codingAgentProjectsRoot: (): string => value("codingAgentProjectsRoot"),
    codingAgentSessionsDir: (): string => value("codingAgentSessionsDir"),
    codingAgentWorkerUrl: (): string => value("codingAgentWorkerUrl"),
    codingAgentWorkerPort: (): number => value("codingAgentWorkerPort"),
    codingAgentAuthJson: (): string => value("codingAgentAuthJson"),
    codingAgentModelsJson: (): string => {
      // `build:verify` writes to `.pi-verify/` so it does not overwrite the
      // models.json that prod uses under pm2 (ADR 0006).
      if (getBuildFlags().verifyBuild) {
        return packagePath("coding-agent", ".pi-verify/models.json");
      }
      return value("codingAgentModelsJson");
    },
    codingAgentAgentDir: (): string => value("codingAgentAgentDir"),
    codingAgentPiPackagesDir: (): string => value("codingAgentPiPackagesDir"),
    codingAgentArtifactsDir: (): string => value("codingAgentArtifactsDir"),
    codingAgentArtifactsUrl: (): string | undefined => value("codingAgentArtifactsUrl"),
    dbProvider: (): string | undefined => value("dbProvider"),
    dbDialect: (): string | undefined => value("dbDialect"),
    contextWindow: (): number => value("contextWindow"),
    ragUploadLimit: (): string | undefined => value("ragUploadLimit"),
    debugChunking: (): boolean => value("debugChunking"),
    disableDevIndicator: (): boolean => value("disableDevIndicator"),
    otelEnabled: (): boolean => value("otelEnabled"),
    authTrustHost: (): boolean => value("authTrustHost"),
    evalBaseUrl: (): string | undefined => value("evalBaseUrl"),
    serverOutput: (): boolean => value("serverOutput"),
    privateBehavior: (): string | undefined => value("privateBehavior"),

    // --- tracing ---
    traceEnabled: (): boolean => value("traceEnabled"),
    traceRaw: (): boolean => value("traceRaw"),
    traceDir: (): string => value("traceDir"),
    traceRunId: (): string | undefined => value("traceRunId"),

    // --- build (ADR 0006) ---
    nextBuildDir: (): string =>
      getBuildFlags().verifyBuild ? ".next/verify" : value("nextBuildDir"),
    verifyBuild: (): boolean => getBuildFlags().verifyBuild,
    allowProdBuild: (): boolean => getBuildFlags().allowProdBuild,
  });
}

export type ConfigFacade = ReturnType<typeof createConfigFacade>;

/** Converts a throwing accessor into `undefined` (historical compatibility). */
export function optional<T>(get: () => T): T | undefined {
  try {
    return get();
  } catch {
    return undefined;
  }
}
