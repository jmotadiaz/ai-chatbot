"use server";

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/features/auth/auth-config";
import { getDb } from "@/lib/infrastructure/db/db";
import { userApiKey } from "@/lib/infrastructure/db/schema";

const API_KEY_PREFIX = "pk_";

export async function listApiKeys() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  return await getDb()
    .select({
      id: userApiKey.id,
      name: userApiKey.name,
      createdAt: userApiKey.createdAt,
      key: userApiKey.key,
    })
    .from(userApiKey)
    .where(eq(userApiKey.userId, session.user.id));
}

export async function createApiKey(name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const key = API_KEY_PREFIX + crypto.randomBytes(24).toString("hex");

  const [newKey] = await getDb()
    .insert(userApiKey)
    .values({
      userId: session.user.id,
      name,
      key: key,
    })
    .returning();

  revalidatePath("/api-keys");
  return newKey;
}

export async function revokeApiKey(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await getDb()
    .delete(userApiKey)
    .where(and(eq(userApiKey.id, id), eq(userApiKey.userId, session.user.id)));

  revalidatePath("/api-keys");
}
