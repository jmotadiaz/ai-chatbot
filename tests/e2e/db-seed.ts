import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { user } from "@/lib/db/schema";

export const TEST_USER_EMAIL = "test@test.com";
export const TEST_USER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

export async function seedDatabase(db: PostgresJsDatabase) {
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      password: "$2b$10$testtestsalt123456789012uG9dWQd8U1xMOPuQJxFr7eETeM2Yy",
    })
    .onConflictDoNothing()
    .returning();
}
