import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
  path: process.env.USE_MOCK_PROVIDERS ? ".env.test" : ".env.development.local",
});

export default defineConfig({
  schema: "./lib/infrastructure/db/schema.ts",
  out: "./lib/infrastructure/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint: Forbidden non-null assertion.
    url: process.env.POSTGRES_URL!,
  },
});
