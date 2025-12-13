import postgres from "postgres";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = PostgresJsDatabase<typeof schema> & { $client: any };

let db: DB;

export const setDb = (newDb: DB) => {
  db = newDb;
};

export const getDb = (): DB => {
  if (!db) {
    const client = postgres(process.env.POSTGRES_URL!);
    db = drizzle(client, { schema });
  }
  return db;
};
