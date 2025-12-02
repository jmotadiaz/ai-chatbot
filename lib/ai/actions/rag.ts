"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  deleteResources,
  deleteResourcesByTitle,
  transaction,
} from "@/lib/db/queries";


import { saveUrlResource } from "@/lib/ai/rag/pipelines";

export interface ProcessResult {
  success: boolean;
  resourcesCreated?: number;
  embeddingsCreated?: number;
  error?: string;
}

export async function uploadResources(
  formData: FormData
): Promise<ProcessResult> {
  const session = await auth();
  const result = { resourcesCreated: 0 };

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const jsonFile = formData.get("jsonFile") as File;
    const url = formData.get("url") as string;
    const container = formData.get("container") as string | undefined;
    const excludeSelectors = formData.get("excludeSelectors") as string | undefined;

    if (!jsonFile && !url) {
      return { success: false, error: "No files provided" };
    }

    if (url) {
      const {success} = await saveUrlResource({
        url,
        container,
        excludeSelectors: excludeSelectors
          ? excludeSelectors.split(",").map((s) => s.trim())
          : undefined,
      }, session.user.id);

      if (success) {
        result.resourcesCreated++;
      }
    }

    // Process JSON file with URLs if provided
    if (jsonFile) {
      const fileContent = await jsonFile.text();
      let jsonData;

      try {
        jsonData = JSON.parse(fileContent);
      } catch {
        return { success: false, error: "Invalid JSON file" };
      }

      if (!jsonData.urls || !Array.isArray(jsonData.urls)) {
        return { success: false, error: "JSON must contain 'urls' array" };
      }

      const { urls, container, excludeSelectors } = jsonData as {
        urls: string[];
        container?: string;
        excludeSelectors?: string[];
      };

      if (urls.length === 0) {
        return { success: false, error: "No URLs provided in JSON file" };
      }

      if (process.env.NODE_ENV === "production" && urls.length > 200) {
        return { success: false, error: "Max 200 URLs" };
      }

      console.log(`Processing ${urls.length} URLs...`);

      for (const url of urls) {
        const {success} = await saveUrlResource(
          {
          url,
          container,
          excludeSelectors,
        },
          session.user.id
        );
        if (success) {
          result.resourcesCreated++;
        }
      }
    }

    revalidatePath("/rag");

    console.log(
      `Completed: ${result.resourcesCreated} resources`
    );

    return {
      success: true,
      resourcesCreated: result.resourcesCreated,
    };
  } catch (error) {
    console.error("Error in uploadRAGResources:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
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
