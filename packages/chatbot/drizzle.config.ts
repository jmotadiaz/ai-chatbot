import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { config } from "config";

loadEnv({
  path:
    process.env.NEXT_PUBLIC_ENV === "test"
      ? ".env.test"
      : ".env.development.local",
});

export default defineConfig({
  schema: "./lib/infrastructure/db/schema.ts",
  out: "./lib/infrastructure/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint: Forbidden non-null assertion.
    url: config.postgresUrl(),
  },
});
