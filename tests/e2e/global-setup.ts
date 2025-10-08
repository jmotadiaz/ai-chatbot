import path from "path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { seedDatabase } from "./db-seed";

async function globalSetup() {
  // Conexión a la base de datos de prueba
  const client = postgres(process.env.POSTGRES_URL!);
  const db = drizzle(client);

  console.log(process.env.POSTGRES_URL);

  try {
    // Ejecutar migraciones
    console.log("Ejecutando migraciones...");
    await migrate(db, {
      migrationsFolder: path.join(__dirname, "../../lib/db/migrations"),
    });
    console.log("Migraciones completadas");

    // Insertar datos iniciales
    console.log("Insertando datos iniciales...");
    await seedDatabase(db);
    console.log("Datos iniciales insertados");
  } catch (error) {
    console.error("Error en setup global:", error);
    throw error;
  } finally {
    await client.end();
  }
}

export default globalSetup;
