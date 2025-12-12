// eslint-disable import-x/no-unresolved
import "server-only";

import type { ExtractTablesWithRelations } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";

import type { PgTransaction } from "drizzle-orm/pg-core";
import { user, type User } from "@/lib/db/schema";
import { generateHashedPassword } from "@/lib/db/utils";
import type { schema } from "@/lib/db/db";
import { getDb } from "@/lib/db/db";

export interface SafeTransaction {
  id: string;
  userId: string;
}

export type Transactional<T = unknown> = (
  tx: PgTransaction<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >
) => Promise<T>;

// Helper type to extract the return type from a Transactional
type ExtractTransactionalType<T> = T extends Transactional<infer U> ? U : never;

export function transaction<
  T extends readonly [Transactional<unknown>, ...Transactional<unknown>[]]
>(...fns: T): Promise<{ [K in keyof T]: ExtractTransactionalType<T[K]> }>;

export function transaction(
  ...fns: Transactional<unknown>[]
): Promise<unknown> {
  try {
    return getDb().transaction(async (tx) => {
      return Promise.all(fns.map((fn) => fn(tx)));
    });
  } catch (error) {
    console.error("Failed to execute transaction", error);
    throw error;
  }
}

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
