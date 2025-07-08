"use server";

import { revalidatePath } from "next/cache";
import {
  deleteProject as deleteDBProject,
  transaction,
} from "@/lib/db/queries";
import { auth } from "@/auth";

export async function deleteProject(id: string) {
  const session = await auth();
  if (!session?.user) {
    return;
  }

  try {
    await transaction(deleteDBProject({ id, userId: session.user.id }));
    revalidatePath("/");
    revalidatePath("/project/new");
  } catch (error) {
    console.error("Failed to delete project:", error);
  }
}
