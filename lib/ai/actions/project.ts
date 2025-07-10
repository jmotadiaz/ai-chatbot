"use server";

import { revalidatePath } from "next/cache";
import {
  deleteProject as deleteDBProject,
  transaction,
  createProject as createDBProject,
  updateProject as updateDBProject,
} from "@/lib/db/queries";
import { auth } from "@/auth";
import { InsertProject } from "@/lib/db/schema";

export async function createProject(
  project: Omit<InsertProject, "id" | "userId">
) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const projectWithUserId = { ...project, userId: session.user.id };

  try {
    const newProject = await transaction(createDBProject(projectWithUserId));
    revalidatePath("/");
    revalidatePath("/project/new");
    return newProject;
  } catch (error) {
    console.error("Failed to create project:", error);
    throw error;
  }
}

export async function updateProject(
  id: string,
  project: Partial<Omit<InsertProject, "id" | "userId">>
) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  try {
    await transaction(
      updateDBProject({ id, userId: session.user.id }, project)
    );
    revalidatePath("/");
    revalidatePath(`/project/${id}`);
  } catch (error) {
    console.error("Failed to update project:", error);
    throw error;
  }
}

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
