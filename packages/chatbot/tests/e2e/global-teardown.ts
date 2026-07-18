import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { reset } from "drizzle-seed";
import { schema } from "@/lib/infrastructure/db/db";

const getTestPostgresUrl = () =>
  process.env.POSTGRES_URL ?? "postgres://postgres:postgres@localhost:5434/test";

async function globalTeardown() {
  const client = postgres(getTestPostgresUrl());
  const db = drizzle(client);
  try {
    await reset(db, schema);
  } catch (error) {
    // If globalSetup failed (e.g. DB not reachable), avoid masking the root error.
    console.warn("[global-teardown] Skipping DB reset due to error:", error);
  } finally {
    await client.end({ timeout: 0 }).catch(() => {});
  }
}

export default globalTeardown;
