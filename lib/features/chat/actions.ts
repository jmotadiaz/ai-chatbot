"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/features/auth/cached-auth";

import {
  deleteChat as deleteDBChat,
  getChatById,
  updateChat,
} from "@/lib/features/chat/queries";
import { transaction } from "@/lib/infrastructure/db/queries";

export async function deleteChat(id: string) {
  const session = await getSession();
  if (!session?.user) {
    return;
  }

  try {
    await transaction(deleteDBChat({ id, userId: session.user.id }));
    revalidatePath("/");
    revalidatePath("/chat/history");
  } catch (error) {
    console.error("Failed to delete chat:", error);
  }
}

export async function togglePinChat(id: string) {
  const session = await getSession();
  if (!session?.user) {
    return;
  }

  try {
    const dbChat = await getChatById({ id, userId: session.user.id });
    if (!dbChat) return;

    await transaction(
      updateChat(
        { id, userId: session.user.id },
        { pinned: !dbChat.pinned, updatedAt: dbChat.updatedAt },
      ),
    );
    revalidatePath("/");
    revalidatePath("/chat/history");
  } catch (error) {
    console.error("Failed to toggle pin chat:", error);
  }
}
