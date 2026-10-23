import type { SecretsConfig } from "./types";

/**
 * Template for `SecretsConfig` (versioned).
 *
 * Copy this file to `secrets.prod.ts` or `secrets.dev.ts` (both gitignored)
 * and fill in the real values:
 *
 * ```sh
 * cp packages/config/src/secrets.example.ts packages/config/src/secrets.dev.ts
 * ```
 *
 * The secrets files are imported STATICALLY from `env.<env>.ts`: if one is
 * missing, `tsc` and the bundler fail at compile time (never at runtime).
 * The test values live in `secrets.test.ts` (versioned, fake).
 *
 * `postgresUrl` must point at the isolated DB of the Environment
 * (`prod → :5435/prod`, `dev → :5433/dev`, `test → :5434/test`): the
 * `guardrails.ts` guardrail rejects a DSN from another Environment.
 */
export const secretsExample = {
  postgresUrl: "postgres://user:password@localhost:5435/prod",
  modelGatewayApiKey: "replace-with-the-gateway-master-key",
  authSecret: "replace-with-a-long-random-string",
  // Optional: only the consumers that use them (Exa, MCP).
  exaSearchApiKey: undefined,
  exaApiKey: undefined,
  mcpApiKey: undefined,
} satisfies SecretsConfig;
