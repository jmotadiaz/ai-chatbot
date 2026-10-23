import { defineConfig } from "drizzle-kit";
import { config, initConfig, parseEnvironmentFromArgv } from "config";

// drizzle-kit loads this file and does NOT forward its CLI flags to the config
// (spec ticket 03): `process.argv` will only carry `--env=...` when the
// file is evaluated in a process that brings it. That's why the Environment is taken
// with the canonical parser from `config` and, if absent, falls back to the default
// local Environment, `dev` — NEVER to an environment variable (the `NEXT_PUBLIC_ENV`/
// `.env` resolution died with ADR 0011).
const environment = parseEnvironmentFromArgv(process.argv) ?? "dev";
const allowProdPush =
  process.argv.includes("--allow-prod-push") ||
  process.env.ALLOW_PROD_PUSH === "1";
if (environment === "prod" && !allowProdPush) {
  throw new Error(
    "❌ drizzle-kit is blocked for the prod Environment by default (ADR 0001). Schema changes in production must be applied through versioned migrations (pnpm db:prod:migrate). If, as the operator, you need to force drizzle-kit push against production, explicitly pass --allow-prod-push or ALLOW_PROD_PUSH=1.",
  );
}
initConfig(environment);

export default defineConfig({
  schema: "./lib/infrastructure/db/schema.ts",
  out: "./lib/infrastructure/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: config.postgresUrl(),
  },
});
