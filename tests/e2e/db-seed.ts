import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { User, user } from "@/lib/db/schema";

let userTest: User | undefined;

export async function seedDatabase(db: PostgresJsDatabase) {
  const email = `test@test.com`;
  const password =
    "$2b$10$testtestsalt123456789012uG9dWQd8U1xMOPuQJxFr7eETeM2Yy";
  await db.insert(user).values({ email, password }).returning();
}

export function getTestUserTest() {
  if (!userTest) {
    throw new Error("Database not seeded yet");
  }
  return userTest;
}
