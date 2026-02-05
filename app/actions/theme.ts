"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/features/auth/cached-auth";
import { getDb } from "@/lib/infrastructure/db/db";
import { updateUserTheme } from "@/lib/features/auth/queries";

export async function updateTheme(theme: string) {
  const session = await getSession();
  if (!session?.user?.email) {
    return;
  }

  // Validate theme input
  if (!["light", "dark", "system"].includes(theme)) {
    console.error(`Invalid theme value: ${theme}`);
    return;
  }

  const typedTheme = theme as "light" | "dark" | "system";

  await getDb().transaction(async (tx) => {
    await updateUserTheme(session.user!.email!, typedTheme)(tx);
  });

  // Revalidate the root layout so generateViewport can pick up the new theme
  revalidatePath("/", "layout");
}
