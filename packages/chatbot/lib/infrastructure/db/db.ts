import postgres from "postgres";
import { drizzle as postgresDrizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as pgliteDrizzle, PgliteDatabase } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { config } from "config";
import {
  chat,
  user,
  message,
  project,
  resource,
  chunk,
  embedding,
  codingAgentSessions,
  projectRelations,
  chatRelations,
  messageRelations,
  resourceRelations,
  chunkRelations,
  embeddingRelations,
} from "@/lib/infrastructure/db/schema";

// Define the schema for drizzle
export const schema = {
  user,
  chat,
  message,
  project,
  resource,
  chunk,
  embedding,
  codingAgentSessions,
  projectRelations,
  chatRelations,
  messageRelations,
  resourceRelations,
  chunkRelations,
  embeddingRelations,
} as const;

export type DB = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

let db: DB;

export const setDb = (newDb: DB) => {
  db = newDb;
};

export const getDb = (): DB => {
  if (!db) {
    const usePglite =
      config.dbProvider() === "pglite" ||
      config.dbDialect() === "pglite";

    if (usePglite) {
      const client = new PGlite({
        extensions: {
          vector,
        },
      });
      db = pgliteDrizzle({ client, schema }) as unknown as DB;
    } else {
      const client = postgres(config.postgresUrl());
      db = postgresDrizzle({ client, schema }) as unknown as DB;
    }
  }
  return db;
};

