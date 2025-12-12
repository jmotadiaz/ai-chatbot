"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { transaction } from "@/lib/db/queries";
import {
  deleteResources,
  deleteResourcesByTitle,
  deleteResourcesByTitles,
} from "./queries";

import { saveUrlResource } from "./ingestion/pipeline";

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
    const startTime = Date.now();
    const jsonFiles = formData.getAll("jsonFile") as File[];
    const url = formData.get("url") as string;
    const container = formData.get("container") as string | undefined;
    const excludeSelectors = formData.get("excludeSelectors") as
      | string
      | undefined;

    if (jsonFiles.length === 0 && !url) {
      return { success: false, error: "No files provided" };
    }

    if (url) {
      const { success } = await saveUrlResource(
        {
          url,
          container,
          excludeSelectors: excludeSelectors
            ? excludeSelectors.split(",").map((s) => s.trim())
            : undefined,
        },
        session.user.id
      );

      if (success) {
        result.resourcesCreated++;
      }
    }

    // Process JSON files with URLs if provided
    if (jsonFiles.length > 0) {
      for (const jsonFile of jsonFiles) {
        const fileContent = await jsonFile.text();
        let jsonData;

        try {
          jsonData = JSON.parse(fileContent);
        } catch {
          console.error(`Invalid JSON file: ${jsonFile.name}`);
          continue; // Skip invalid files but continue processing others
        }

        if (!jsonData.urls || !Array.isArray(jsonData.urls)) {
          console.error(`JSON must contain 'urls' array: ${jsonFile.name}`);
          continue;
        }

        const { urls, container, excludeSelectors } = jsonData as {
          urls: string[];
          container?: string;
          excludeSelectors?: string[];
        };

        if (urls.length === 0) {
          console.warn(`No URLs provided in JSON file: ${jsonFile.name}`);
          continue;
        }

        if (process.env.NODE_ENV === "production" && urls.length > 200) {
          console.warn(`Max 200 URLs per file: ${jsonFile.name}`);
          // We could return error here or just process first 200.
          // For now let's stick to previous behavior but maybe just warn and skip or process?
          // The previous code returned error. Let's return error if it's a single file, but for multiple maybe just skip?
          // Or better, just error out for that file.
          continue;
        }

        console.log(`Processing ${urls.length} URLs from ${jsonFile.name}...`);

        const BATCH_SIZE = 10;
        for (let i = 0; i < urls.length; i += BATCH_SIZE) {
          const batchUrls = urls.slice(i, i + BATCH_SIZE);

          await Promise.all(
            batchUrls.map(async (url) => {
              const { success } = await saveUrlResource(
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
            })
          );
        }
      }
    }

    revalidatePath("/rag");

    console.log(`Completed: ${result.resourcesCreated} resources`);

    const duration = Date.now() - startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = ((duration % 60000) / 1000).toFixed(0);
    console.log(`Total duration: ${minutes}m ${seconds}s (${duration}ms)`);

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

export async function deleteSelectedResources(
  titles: string[]
): Promise<ProcessResult> {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const [result] = await transaction(
      deleteResourcesByTitles({
        titles,
        userId: session.user.id,
      })
    );

    if (result.length === 0) {
      return { success: false, error: "No resources found to delete" };
    }
    revalidatePath("/rag");

    return { success: true };
  } catch (error) {
    console.error("Error in deleteSelectedResources:", error);
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
