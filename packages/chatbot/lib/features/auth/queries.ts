import "server-only";
import { eq } from "drizzle-orm";
import { user, type User } from "@/lib/infrastructure/db/schema";
import { generateHashedPassword } from "@/lib/features/auth/utils";
import { getDb } from "@/lib/infrastructure/db/db";
import type { Transactional } from "@/lib/infrastructure/db/queries";

export function getUser(email: string): Promise<Array<User>> {
  try {
    return getDb().select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error("Failed to get user from database");
    throw error;
  }
}

export const createUser =
  (email: string, password: string): Transactional<Array<User>> =>
  (tx) => {
    const hashedPassword = generateHashedPassword(password);
    return tx
      .insert(user)
      .values({ email, password: hashedPassword })
      .returning();
  };

export const updateUserTheme =
  (
    email: string,
    theme: "light" | "dark" | "system",
  ): Transactional<Array<User>> =>
  (tx) => {
    return tx
      .update(user)
      .set({ theme })
      .where(eq(user.email, email))
      .returning();
  };
