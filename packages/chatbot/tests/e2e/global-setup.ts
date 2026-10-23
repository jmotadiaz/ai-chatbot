import path from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { config } from "config";
import { ensureMockGateway, MOCK_GATEWAY_PORT } from "../mocks/gateway/server";

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
  // The DSN comes from the static Test bundle (ADR 0011), not from the shell:
  // the Environment↔DB guardrail already validated `:5434/test` when loading
  // `env.test.ts`.
  const postgresUrl = config.postgresUrl();

  await waitForPostgres(postgresUrl);

  // Mock Model Gateway (ADR 0010, ticket 02): .env.test points
  // MODEL_GATEWAY_URL to http://127.0.0.1:4001; make sure the mock is up before
  // the suite (idempotent: it reuses the port if another process already serves it).
  const gateway = await ensureMockGateway({ port: MOCK_GATEWAY_PORT });
  console.log(
    `[global-setup] Mock Model Gateway ${gateway.started ? "started" : "reused"} on :${gateway.port}`,
  );

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
