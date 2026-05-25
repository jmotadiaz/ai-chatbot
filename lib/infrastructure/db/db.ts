import postgres from "postgres";
import { drizzle as postgresDrizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as pgliteDrizzle, PgliteDatabase } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import {
  chat,
  user,
  message,
  project,
  resource,
  chunk,
  embedding,
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
      process.env.DB_PROVIDER === "pglite" ||
      process.env.DB_DIALECT === "pglite";

    if (usePglite) {
      const client = new PGlite({
        extensions: {
          vector,
        },
      });
      db = pgliteDrizzle({ client, schema }) as unknown as DB;
    } else {
      const client = postgres(process.env.POSTGRES_URL!);
      db = postgresDrizzle({ client, schema }) as unknown as DB;
    }
  }
  return db;
};

