import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config, initConfig, optional, parseEnvironmentFromArgv } from "config";

/**
 * Per-Environment migrations: `tsx lib/infrastructure/db/migrate.ts --env=dev|test|prod`
 * (ADR 0011 — the Environment arrives through process.argv, no dotenv). Each Environment
 * migrates ITS isolated database (`packages/config` guardrails: dev↔5433/dev,
 * test↔5434/test, prod↔5435/prod). No `--env` → fail fast.
 */
const environment = parseEnvironmentFromArgv(process.argv);
if (!environment) {
  console.error(
    "❌ migrate.ts requires --env=dev|test|prod (ADR 0011). E.g.: npx tsx lib/infrastructure/db/migrate.ts --env=dev",
  );
  process.exit(1);
}
initConfig(environment);

const runMigrate = async () => {
  const url = optional(() => config.postgresUrl());
  if (!url) {
    throw new Error("POSTGRES_URL is not defined");
  }

  const connection = postgres(url!, { max: 1 });
  const db = drizzle(connection);

  console.log(`⏳ Running migrations (${environment})...`);

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
