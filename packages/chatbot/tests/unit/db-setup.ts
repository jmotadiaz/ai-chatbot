import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { schema, setDb, type DB } from "@/lib/infrastructure/db/db";

async function runMigrations(pglite: PGlite) {
  const migrationsFolder = path.resolve(process.cwd(), "./lib/infrastructure/db/migrations");
  const files = fs.readdirSync(migrationsFolder)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsFolder, file);
    const sqlContent = fs.readFileSync(filePath, "utf8");
    try {
      await pglite.exec(sqlContent);
    } catch (err) {
      console.error(`❌ Migration failed at: ${file}`, err);
      throw err;
    }
  }
}

export async function setupTestDb() {
  // 1. Spin up PGlite with pgvector support
  const pglite = await PGlite.create({
    extensions: {
      vector,
    },
  });

  // 2. Run migrations
  await runMigrations(pglite);

  // 3. Setup Drizzle client and set it globally
  const db = drizzle({ client: pglite, schema });
  setDb(db as DB);

  return db;
}
