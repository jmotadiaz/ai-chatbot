"use server";

import {
  deleteChat as deleteDBChat,
  deleteProject,
  transaction,
} from "@/lib/db/queries";
import { revalidatePath } from "next/cache";
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

export async function deleteProjectAction(id: string) {
  const session = await auth();
  if (!session?.user) {
    return;
  }

  try {
    await deleteProject({ id, userId: session.user.id });
    revalidatePath("/");
    revalidatePath("/project/new");
  } catch (error) {
    console.error("Failed to delete project:", error);
  }
}
