import { packagePath } from "./paths";
import type { AppConfig, Entorno } from "./types";

/**
 * Flags de compilación (ADR 0006) compartidos por el selector `config.ts` y
 * por los bundles `env.<env>.ts`.
 *
 * `--verify` y `--allow-prod-build` no eligen Entorno: ajustan los artefactos
 * que escribe la compilación. Viven en estado de módulo para que el bundle
 * estático al que el bundler de Next.js redirige `"config"` (que no puede
 * re-ejecutar `initConfig`) los vea: `scripts/next-cli.ts` llama a
 * `initConfig()` en el MISMO proceso que evalúa `next.config.ts`.
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

/** Test hook: vuelve a los flags por defecto. */
export function resetBuildFlagsForTests(): void {
  flags = { verifyBuild: false, allowProdBuild: false };
}

/**
 * Fachada funcional congelada sobre un bundle del Entorno (ADR 0011).
 *
 * Mantiene la API histórica (`config.postgresUrl()`, `config.codingAgentAuthJson()`,
 * …) para que los ~50 puntos de llamada del monorepo no cambien. Cada método
 * resuelve el bundle en la llamada: en `env.<env>.ts` es un valor fijo; en el
 * selector `config.ts` es el Entorno activo.
 */
export function createConfigFacade(resolveBundle: () => AppConfig) {
  const value = <K extends keyof AppConfig>(key: K): AppConfig[K] => resolveBundle()[key];

  return Object.freeze({
    entorno: (): Entorno => value("entorno"),

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
      // `build:verify` escribe en `.pi-verify/` para no pisar el models.json
      // que usa prod bajo pm2 (ADR 0006).
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

    // --- compilación (ADR 0006) ---
    nextBuildDir: (): string =>
      getBuildFlags().verifyBuild ? ".next/verify" : value("nextBuildDir"),
    verifyBuild: (): boolean => getBuildFlags().verifyBuild,
    allowProdBuild: (): boolean => getBuildFlags().allowProdBuild,
  });
}

export type ConfigFacade = ReturnType<typeof createConfigFacade>;
