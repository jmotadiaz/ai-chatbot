import { defineConfig } from "drizzle-kit";
import { config, initConfig, parseEntornoFromArgv } from "config";

// drizzle-kit carga este fichero y NO reenvía los flags de su CLI al config
// (spec ticket 03): `process.argv` solo contendrá `--env=...` cuando el
// fichero se evalúa en un proceso que lo trae. Por eso el Entorno se toma con
// el parser canónico de `config` y, si no está, cae al Entorno local por
// defecto, `dev` — NUNCA a una variable de entorno (la resolución por
// `NEXT_PUBLIC_ENV`/`.env` murió con ADR 0011).
const entorno = parseEntornoFromArgv(process.argv) ?? "dev";
const allowProdPush =
  process.argv.includes("--allow-prod-push") ||
  process.env.ALLOW_PROD_PUSH === "1";
if (entorno === "prod" && !allowProdPush) {
  throw new Error(
    "❌ drizzle-kit está bloqueado para el entorno prod por defecto (ADR 0001). Las modificaciones de esquema en producción deben aplicarse mediante migraciones versionadas (pnpm db:prod:migrate). Si como operador necesitas forzar drizzle-kit push contra producción, usa explícitamente --allow-prod-push o ALLOW_PROD_PUSH=1.",
  );
}
initConfig(entorno);

export default defineConfig({
  schema: "./lib/infrastructure/db/schema.ts",
  out: "./lib/infrastructure/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: config.postgresUrl(),
  },
});
