import { drizzle } from "drizzle-orm/postgres-js";
import { reset } from "drizzle-seed";
import postgres from "postgres";
import { config } from "config";
import { stopMockGateway } from "../mocks/gateway/server";
import { schema } from "@/lib/infrastructure/db/db";

async function globalTeardown() {
  const postgresUrl = config.postgresUrl();
  if (!postgresUrl.includes("5434/test")) {
    throw new Error(
      `[e2e teardown guardrail] POSTGRES_URL="${postgresUrl}" no apunta a la DB de Test (5434/test). Abortando reset para proteger datos.`,
    );
  }

  const client = postgres(postgresUrl);
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
