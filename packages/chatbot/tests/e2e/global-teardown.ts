import { drizzle } from "drizzle-orm/postgres-js";
import { reset } from "drizzle-seed";
import postgres from "postgres";
import { stopMockGateway } from "../mocks/gateway/server";
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
    // El mock es de este proceso (el global setup lo arrancó): bajarlo aquí.
    await stopMockGateway();
  }
}

export default globalTeardown;
