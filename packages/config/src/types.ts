/**
 * Contract of the Environment-typed configuration (ADR 0011).
 *
 * — `StructuralConfig`: values versioned in Git (`config.<env>.ts`), without
 *   secrets, validated at compile time with `satisfies StructuralConfig`.
 * — `SecretsConfig`: credentials (`secrets.<env>.ts`); `secrets.prod.ts` and
 *   `secrets.dev.ts` are gitignored and their absence breaks `tsc`; `secrets.test.ts`
 *   is versioned with deterministic values.
 * — `AppConfig`: the frozen union consumed by the three `env.<env>.ts` bundles.
 *
 * No `process.env`: the active Environment is selected by `process.argv`
 * (`--env=prod|dev|test`) or by `initConfig()` (see `config.ts`).
 */

export type Environment = "prod" | "dev" | "test";

export interface StructuralConfig {
  readonly environment: Environment;
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
