import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config, optional } from "config";
import { resolveEnvFile } from "@/lib/infrastructure/env";

loadEnv({ path: resolveEnvFile() });

const runMigrate = async () => {
  const url = optional(() => config.postgresUrl());
  if (!url) {
    throw new Error("POSTGRES_URL is not defined");
  }

  const connection = postgres(url!, { max: 1 });
  const db = drizzle(connection);

  console.log("⏳ Running migrations...");

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
