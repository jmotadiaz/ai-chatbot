/**
 * Contrato de la configuración tipada por Entorno (ADR 0011).
 *
 * — `StructuralConfig`: valores versionados en Git (`config.<env>.ts`), sin
 *   secretos, validados en compilación con `satisfies StructuralConfig`.
 * — `SecretsConfig`: credenciales (`secrets.<env>.ts`); `secrets.prod.ts` y
 *   `secrets.dev.ts` están gitignored y su ausencia rompe `tsc`; `secrets.test.ts`
 *   se versiona con valores deterministas.
 * — `AppConfig`: la unión congelada que consumen los tres bundles `env.<env>.ts`.
 *
 * Nada de `process.env`: el Entorno activo se selecciona por `process.argv`
 * (`--env=prod|dev|test`) o por `initConfig()` (ver `config.ts`).
 */

export type Entorno = "prod" | "dev" | "test";

export interface StructuralConfig {
  readonly entorno: Entorno;
  readonly port: number;
  readonly modelGatewayUrl: string;
  readonly codingAgentEnabled: boolean;
  readonly codingAgentProjectsRoot: string;
  readonly codingAgentSessionsDir: string;
  readonly codingAgentWorkerUrl: string;
  readonly codingAgentWorkerPort: number;
  readonly codingAgentAuthJson: string;
  readonly codingAgentModelsJson: string;
  readonly codingAgentAgentDir: string;
  readonly codingAgentPiPackagesDir: string;
  readonly codingAgentArtifactsDir: string;
  readonly codingAgentArtifactsUrl?: string;
  readonly dbProvider?: string;
  readonly dbDialect?: string;
  readonly contextWindow: number;
  readonly ragUploadLimit?: string;
  readonly debugChunking: boolean;
  readonly disableDevIndicator: boolean;
  readonly otelEnabled: boolean;
  readonly authTrustHost: boolean;
  readonly evalBaseUrl?: string;
  readonly serverOutput: boolean;
  readonly privateBehavior?: string;
  readonly traceEnabled: boolean;
  readonly traceRaw: boolean;
  readonly traceDir: string;
  readonly traceRunId?: string;
  readonly nextBuildDir: string;
}

export interface SecretsConfig {
  readonly postgresUrl: string;
  readonly modelGatewayApiKey: string;
  readonly authSecret: string;
  readonly exaSearchApiKey?: string;
  readonly exaApiKey?: string;
  readonly mcpApiKey?: string;
}

export type AppConfig = Readonly<StructuralConfig & SecretsConfig>;
