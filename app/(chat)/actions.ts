"use server";

import { deleteChatById } from "@/lib/db/queries";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

export async function deleteChat(id: string) {
  const session = await auth();
  if (!session?.user) {
    return;
  }

  try {
    await deleteChatById({ id });
    revalidatePath("/");
  } catch (error) {
    console.error("Failed to delete chat:", error);
  }
}
