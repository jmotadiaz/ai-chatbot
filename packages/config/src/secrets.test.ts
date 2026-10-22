import type { SecretsConfig } from "./types";

/**
 * Secretos de TEST (versionados): deterministas y falsos por diseño.
 *
 * El DSN apunta a la Postgres de test aislada (`docker-compose.test.yml`,
 * `:5434/test`) y el API key es el que acepta el Mock Model Gateway (`:4001`).
 * Cualquier valor aquí es público: si un secreto real acaba en este fichero,
 * es un bug.
 */
export const secretsTest = {
  postgresUrl: "postgres://postgres:postgres@127.0.0.1:5434/test",
  modelGatewayApiKey: "test-gateway-key",
  authSecret: "test_secret",
  exaApiKey: "test_exa_api_key",
} satisfies SecretsConfig;
