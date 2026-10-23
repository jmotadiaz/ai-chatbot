import type { SecretsConfig } from "./types";

/**
 * TEST secrets (versioned): deterministic and fake by design.
 *
 * The DSN points at the isolated test Postgres (`docker-compose.test.yml`,
 * `:5434/test`) and the API key is the one the Mock Model Gateway (`:4001`)
 * accepts. Any value here is public: if a real secret ends up in this file,
 * it is a bug.
 */
export const secretsTest = {
  postgresUrl: "postgres://postgres:postgres@127.0.0.1:5434/test",
  modelGatewayApiKey: "test-gateway-key",
  authSecret: "test_secret",
  exaApiKey: "test_exa_api_key",
} satisfies SecretsConfig;
