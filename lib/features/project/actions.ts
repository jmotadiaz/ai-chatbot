"use server";

import { revalidatePath } from "next/cache";
import {
  createProject as createDBProject,
  updateProject as updateDBProject,
  deleteProject as deleteDBProject,
} from "./queries";
import {
  createProjectSchema,
  updateProjectSchema,
  type InsertProject,
} from "./types";
import { getSession } from "@/lib/features/auth/cached-auth";
import { transaction } from "@/lib/infrastructure/db/queries";

export async function createProject(
  project: Omit<InsertProject, "id" | "userId">,
) {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  // Validate input
  const validatedFields = createProjectSchema.safeParse(project);
  if (!validatedFields.success) {
    throw new Error(
      `Invalid project data: ${JSON.stringify(validatedFields.error.flatten().fieldErrors)}`,
    );
  }

  const projectWithUserId = { ...project, userId: session.user.id };

  try {
    const [newProject] = await transaction(createDBProject(projectWithUserId));
    revalidatePath("/", "layout");
    revalidatePath(`/project/${newProject.id}`);
    return newProject;
  } catch (error) {
    console.error("Failed to create project:", error);
    throw error;
  }
}

export async function createEmptyProject() {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const emptyProject = {
    userId: session.user.id,
    name: "",
    systemPrompt: "",
    isActive: false,
  };

  try {
    const [newProject] = await transaction(createDBProject(emptyProject));
    return newProject;
  } catch (error) {
    console.error("Failed to create empty project:", error);
    throw error;
  }
}

export async function updateProject(
  id: string,
  project: Partial<Omit<InsertProject, "id" | "userId">>,
) {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  // Validate input
  const validatedFields = updateProjectSchema.safeParse(project);
  if (!validatedFields.success) {
    throw new Error(
      `Invalid project data: ${JSON.stringify(validatedFields.error.flatten().fieldErrors)}`,
    );
  }

  try {
    await transaction(
      updateDBProject({ id, userId: session.user.id }, project),
    );
    revalidatePath("/", "layout");
    revalidatePath(`/project/${id}`);
  } catch (error) {
    console.error("Failed to update project:", error);
    throw error;
  }
}

export async function deleteProject(id: string) {
  const session = await getSession();
  if (!session?.user) {
    return;
  }

  try {
    await transaction(deleteDBProject({ id, userId: session.user.id }));
    revalidatePath("/", "layout");
    revalidatePath(`/project/${id}`);
  } catch (error) {
    console.error("Failed to delete project:", error);
  }
}
