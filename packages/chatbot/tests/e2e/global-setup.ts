import path from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";

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

  // Guardarraíl de Entorno (ticket 05, spec: test↔5434/test). Este setup solo
  // corre para e2e, así que el Entorno es test por definición: si el shell
  // arrastró un POSTGRES_URL de dev/prod, fallamos antes de tocar ninguna DB.
  // La regla canónica vive en packages/config/src/guardrails.ts (ENTORNO_DB).
  if (!postgresUrl.includes("5434/test")) {
    throw new Error(
      `[e2e guardrail] POSTGRES_URL="${postgresUrl}" no apunta a la DB de Test (5434/test). ` +
        "Levanta la DB de Test (`pnpm db:test:start`) y exporta el entorno con `dotenv -o -e .env.test`.",
    );
  }

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
