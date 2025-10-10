import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { reset } from "drizzle-seed";
import { schema } from "@/lib/db/db";

async function globalTeardown() {
  const client = postgres(process.env.POSTGRES_URL!);
  const db = drizzle(client);
  await reset(db, schema);
}

export default globalTeardown;
