import { ConfigError } from "./errors";
import type { AppConfig, Environment, SecretsConfig, StructuralConfig } from "./types";

/**
 * Coherence guardrails Environment ↔ database / Model Gateway
 * (ADR 0001, ADR 0010, ADR 0011 and ADR 0014).
 *
 * Each Environment declares its own isolated DB coordinates and its own Gateway
 * port in `config.<env>.ts`. A DSN that does not match the declared Environment
 * means someone copied another Environment's configuration — writing there is
 * exactly the accident this design exists to prevent, so the bundle fails
 * before opening the first connection.
 *
 * Unlike the previous design (ADR 0005), the Environment is ALWAYS an explicit
 * parameter: this module reads neither `process.env` nor any selector
 * variable.
 */
export const ENVIRONMENT_DSN: Record<Environment, string> = {
  test: "5434/test",
  dev: "5433/dev",
  prod: "5435/prod",
};

/**
 * Only test declares an expected port: dev and prod share the same local
 * Gateway (`:4000`) today. A test that talked to `:4000` would hit real LLMs
 * with real credentials.
 */
export const ENVIRONMENT_GATEWAY_PORT: Partial<Record<Environment, string>> = {
  test: "4001",
};

/** Composes the full Postgres DSN from decomposed coordinates and credentials. */
export function composePostgresUrl(coords: {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
}): string {
  const user = encodeURIComponent(coords.user);
  const pass = encodeURIComponent(coords.password);
  return `postgres://${user}:${pass}@${coords.host}:${coords.port}/${coords.database}`;
}

/** Fails if the DSN does not point at the isolated DB of the declared Environment. */
export function assertDatabaseMatchesEnvironment(
  url: string,
  environment: Environment | string,
): string {
  const expected = ENVIRONMENT_DSN[environment as Environment];
  if (!expected) return url;
  if (!url.includes(expected)) {
    throw new ConfigError(
      "postgresUrl",
      `Environment ${environment} requires the DSN of its isolated DB (${expected}); ` +
        `got "${redactDsn(url)}". Check packages/config/src/config.${environment}.ts.`,
    );
  }
  return url;
}

/** Fails if the Gateway URL does not point at the isolated port of the Environment. */
export function assertGatewayMatchesEnvironment(
  url: string,
  environment: Environment | string,
): string {
  const expectedPort = ENVIRONMENT_GATEWAY_PORT[environment as Environment];
  if (!expectedPort) return url;
  const port = /:(\d+)(?=[/?]|$)/.exec(url)?.[1];
  if (port !== expectedPort) {
    throw new ConfigError(
      "modelGatewayUrl",
      `Environment ${environment} requires the Mock Model Gateway (port ${expectedPort}); ` +
        `got "${url}". Check packages/config/src/config.${environment}.ts.`,
    );
  }
  return url;
}

/** We do not leak credentials in the error message (scheme/host only). */
function redactDsn(url: string): string {
  return url.replace(/\/\/[^@/]*@/, "//***@");
}

/**
 * Validates a whole bundle and returns it unchanged.
 */
export function validateAppConfig(candidate: AppConfig): AppConfig {
  assertDatabaseMatchesEnvironment(candidate.postgresUrl, candidate.environment);
  assertGatewayMatchesEnvironment(candidate.modelGatewayUrl, candidate.environment);
  return candidate;
}

/**
 * Creates an immutable Environment bundle with eager structural config validation
 * and lazy secret resolution (ADR 0014).
 */
export function createEnvironmentBundle(
  structural: StructuralConfig,
  getSecrets: () => SecretsConfig,
): AppConfig {
  assertGatewayMatchesEnvironment(structural.modelGatewayUrl, structural.environment);

  const bundle: Record<string, unknown> = { ...structural };

  const secretKeys: (keyof SecretsConfig)[] = [
    "postgresUser",
    "postgresPassword",
    "modelGatewayApiKey",
    "authSecret",
    "exaApiKey",
    "context7ApiKey",
    "mcpApiKey",
  ];

  for (const key of secretKeys) {
    Object.defineProperty(bundle, key, {
      get() {
        return getSecrets()[key];
      },
      enumerable: true,
      configurable: false,
    });
  }

  Object.defineProperty(bundle, "postgresUrl", {
    get() {
      const secrets = getSecrets();
      const url = composePostgresUrl({
        user: secrets.postgresUser,
        password: secrets.postgresPassword,
        host: structural.postgresHost,
        port: structural.postgresPort,
        database: structural.postgresDatabase,
      });
      return assertDatabaseMatchesEnvironment(url, structural.environment);
    },
    enumerable: true,
    configurable: false,
  });

  return Object.freeze(bundle) as AppConfig;
}
