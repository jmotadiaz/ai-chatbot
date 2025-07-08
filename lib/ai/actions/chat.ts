"use server";

import { revalidatePath } from "next/cache";
import { deleteChat as deleteDBChat, transaction } from "@/lib/db/queries";
import { auth } from "@/auth";

export async function deleteChat(id: string) {
  const session = await auth();
  if (!session?.user) {
    return;
  }

  try {
    await transaction(deleteDBChat({ id, userId: session.user.id }));
    revalidatePath("/");
  } catch (error) {
    console.error("Failed to delete chat:", error);
  }
}
