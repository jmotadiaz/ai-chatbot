import path from "path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const getTestPostgresUrl = () =>
  process.env.POSTGRES_URL ??
  "postgres://postgres:postgres@localhost:5434/test";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForPostgres(postgresUrl: string) {
  // docker compose up -d returns before healthcheck is "healthy"; poll until DB accepts connections.
  let lastError: unknown;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const client = postgres(postgresUrl, { max: 1 });
    try {
      await client`select 1`;
      return;
    } catch (error) {
      lastError = error;
      await sleep(500);
    } finally {
      await client.end({ timeout: 0 }).catch(() => {});
    }
  }
  throw lastError;
}

async function globalSetup() {
  const postgresUrl = getTestPostgresUrl();
  await waitForPostgres(postgresUrl);

  const client = postgres(postgresUrl);
  const db = drizzle(client);

  try {
    console.log("Executing migrations...");
    await migrate(db, {
      migrationsFolder: path.join(
        __dirname,
        "../../lib/infrastructure/db/migrations",
      ),
    });
    console.log("Migrations completed");
  } catch (error) {
    console.error("Error en setup global:", error);
    throw error;
  } finally {
    await client.end();
  }
}

export default globalSetup;
