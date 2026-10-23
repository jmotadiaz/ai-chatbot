import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config, initConfig, optional, parseEntornoFromArgv } from "config";

/**
 * Migraciones por Entorno: `tsx lib/infrastructure/db/migrate.ts --env=dev|test|prod`
 * (ADR 0011 — el Entorno llega por process.argv, sin dotenv). Cada Entorno
 * migra SU base aislada (guardarraíles de `packages/config`: dev↔5433/dev,
 * test↔5434/test, prod↔5435/prod). Sin `--env` → fallo rápido.
 */
const entorno = parseEntornoFromArgv(process.argv);
if (!entorno) {
  console.error(
    "❌ migrate.ts exige --env=dev|test|prod (ADR 0011). Ej: npx tsx lib/infrastructure/db/migrate.ts --env=dev",
  );
  process.exit(1);
}
initConfig(entorno);

const runMigrate = async () => {
  const url = optional(() => config.postgresUrl());
  if (!url) {
    throw new Error("POSTGRES_URL is not defined");
  }

  const connection = postgres(url!, { max: 1 });
  const db = drizzle(connection);

  console.log(`⏳ Running migrations (${entorno})...`);

  const start = Date.now();
  await migrate(db, { migrationsFolder: "./lib/infrastructure/db/migrations" });
  const end = Date.now();

  console.log("✅ Migrations completed in", end - start, "ms");
  process.exit(0);
};

runMigrate().catch((err) => {
  console.error("❌ Migration failed");
  console.error(err);
  process.exit(1);
});
