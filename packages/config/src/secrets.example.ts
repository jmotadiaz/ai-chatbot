import type { SecretsConfig } from "./types";

/**
 * Plantilla de `SecretsConfig` (versionada).
 *
 * Copia este fichero a `secrets.prod.ts` o `secrets.dev.ts` (ambos gitignored)
 * y rellena los valores reales:
 *
 * ```sh
 * cp packages/config/src/secrets.example.ts packages/config/src/secrets.dev.ts
 * ```
 *
 * Los ficheros de secretos se importan ESTÁTICAMENTE desde `env.<env>.ts`:
 * si falta uno, `tsc` y el bundler fallan en compilación (nunca en runtime).
 * Los valores de test viven en `secrets.test.ts` (versionado, falsos).
 *
 * `postgresUrl` debe apuntar a la DB aislada del Entorno
 * (`prod → :5435/prod`, `dev → :5433/dev`, `test → :5434/test`): el
 * guardarraíl de `guardrails.ts` rechaza un DSN de otro Entorno.
 */
export const secretsExample = {
  postgresUrl: "postgres://user:password@localhost:5435/prod",
  modelGatewayApiKey: "replace-with-the-gateway-master-key",
  authSecret: "replace-with-a-long-random-string",
  // Opcionales: solo los consumidores que los usan (Exa, MCP).
  exaSearchApiKey: undefined,
  exaApiKey: undefined,
  mcpApiKey: undefined,
} satisfies SecretsConfig;
