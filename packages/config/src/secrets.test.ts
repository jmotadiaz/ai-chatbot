import type { SecretsConfig } from "./types";

/**
 * TEST secrets (versioned): deterministic and fake by design.
 *
 * The API key is the one the Mock Model Gateway (`:4001`) accepts.
 * Database coordinates live in `config.test.ts` (127.0.0.1:5434/test).
 * Any value here is public: if a real secret ends up in this file,
 * it is a bug.
 */
export const secretsTest = {
  postgresUser: "postgres",
  postgresPassword: "postgres",
  modelGatewayApiKey: "test-gateway-key",
  authSecret: "test_secret",
  exaApiKey: "test_exa_api_key",
  context7ApiKey: "test_context7_api_key",
} satisfies SecretsConfig;
