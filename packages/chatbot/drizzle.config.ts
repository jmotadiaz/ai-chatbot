import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { config } from "config";
import { resolveEnvFile } from "./lib/infrastructure/env";

// Resuelve el .env del Entorno activo (NEXT_PUBLIC_ENV → .env.dev|.env.test|.env.prod)
// antes de leer POSTGRES_URL: cada Entorno migra/empuja su propia DB.
loadEnv({ path: resolveEnvFile() });

export default defineConfig({
  schema: "./lib/infrastructure/db/schema.ts",
  out: "./lib/infrastructure/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: config.postgresUrl(),
  },
});
