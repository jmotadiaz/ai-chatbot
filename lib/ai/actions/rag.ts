"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  deleteResources,
  deleteResourcesByTitle,
  transaction,
} from "@/lib/db/queries";



export interface ProcessResult {
  success: boolean;
  resourcesCreated?: number;
  embeddingsCreated?: number;
  error?: string;
}

export async function deleteResource(title: string): Promise<ProcessResult> {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const [result] = await transaction(
      deleteResourcesByTitle({
        title,
        userId: session.user.id,
      })
    );

    if (result.length === 0) {
      return { success: false, error: "Resource not found" };
    }
    revalidatePath("/rag");

    return { success: true };
  } catch (error) {
    console.error("Error in deleteResource:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function deleteAllResources(): Promise<ProcessResult> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  } else if (!session.user.id) {
    return { success: false, error: "User ID not found in session" };
  }
  try {
    const [deletedResources] = await transaction(
      deleteResources({
        userId: session.user.id,
      })
    );

    if (deletedResources.length === 0) {
      return { success: false, error: "No resources found to delete" };
    }

    revalidatePath("/rag");

    return { success: true };
  } catch (error) {
    console.error("Error in deleteAllResources:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
