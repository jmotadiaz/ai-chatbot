"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  deleteResources,
  deleteResourcesByTitleFilter,
  deleteResourcesByTitle,
  deleteResourcesByTitles,
  getUniqueResourceTitlesByUserIdPaginated,
  addResourceToProject,
  removeResourceFromProject,
  getProjectResourcesPaginated,
  getUserResourcesNotInProject,
  getResourceById,
  deleteResourceById,
} from "./queries";
import { saveUrlResource, saveMarkdownResource } from "./ingestion/pipeline";
import { getSession } from "@/lib/features/auth/cached-auth";
// ... (trimmed imports)
import { transaction } from "@/lib/infrastructure/db/queries";

// Schemas for input validation
const resourceIdSchema = z.string().uuid();
const projectIdSchema = z.string().uuid();
const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  filter: z.string().default(""),
});

export interface ProcessResult {
  success: boolean;
  resourcesCreated?: number;
  embeddingsCreated?: number;
  error?: string;
}

export async function uploadResources(
  formData: FormData,
): Promise<ProcessResult> {
  const session = await getSession();
  const result = { resourcesCreated: 0 };

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const startTime = Date.now();
    const jsonFiles = formData.getAll("jsonFile") as File[];
    const markdownFiles = formData.getAll("markdownFile") as File[];
    const url = formData.get("url") as string;
    const container = formData.get("container") as string | undefined;
    const excludeSelectors = formData.get("excludeSelectors") as
      | string
      | undefined;

    const projectId = formData.get("projectId") as string | undefined;

    if (jsonFiles.length === 0 && markdownFiles.length === 0 && !url) {
      return { success: false, error: "No files provided" };
    }

    if (url) {
      const { success } = await saveUrlResource({
        urlResource: {
          url,
          container,
          excludeSelectors: excludeSelectors
            ? excludeSelectors.split(",").map((s) => s.trim())
            : undefined,
        },
        userId: session.user.id,
        projectId,
      });

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

        if (process.env.RAG_UPLOAD_LIMIT !== "false" && urls.length > 200) {
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
              const { success } = await saveUrlResource({
                urlResource: {
                  url,
                  container,
                  excludeSelectors,
                },
                userId: session.user.id,
                projectId,
              });
              if (success) {
                result.resourcesCreated++;
              }
            }),
          );
        }
      }
    }

    // Process markdown files if provided
    if (markdownFiles.length > 0) {
      for (const markdownFile of markdownFiles) {
        try {
          const fileContent = await markdownFile.text();
          // Use filename without extension as title
          const title = markdownFile.name.replace(/\.md$/i, "");

          const { success } = await saveMarkdownResource({
            title,
            content: fileContent,
            userId: session.user.id,
            projectId,
          });

          if (success) {
            result.resourcesCreated++;
          }
        } catch (error) {
          console.error(
            `Error processing markdown file ${markdownFile.name}:`,
            error,
          );
          // Continue processing other files
        }
      }
    }

    revalidatePath("/rag");
    if (projectId) {
      revalidatePath(`/project/${projectId}/edit`);
      revalidatePath(`/project/${projectId}/add`);
    }

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
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const [result] = await transaction(
      deleteResourcesByTitle({
        title,
        userId: session.user.id,
      }),
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
  titles: string[],
): Promise<ProcessResult> {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const [result] = await transaction(
      deleteResourcesByTitles({
        titles,
        userId: session.user.id,
      }),
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

export async function deleteResourcesByFilter(
  filter: string,
): Promise<ProcessResult> {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const [result] = await transaction(
      deleteResourcesByTitleFilter({
        filter,
        userId: session.user.id,
      }),
    );

    if (result.length === 0) {
      return { success: false, error: "No resources found to delete" };
    }

    revalidatePath("/rag");
    return { success: true };
  } catch (error) {
    console.error("Error in deleteResourcesByFilter:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function deleteAllResources(): Promise<ProcessResult> {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  } else if (!session.user.id) {
    return { success: false, error: "User ID not found in session" };
  }
  try {
    const [deletedResources] = await transaction(
      deleteResources({
        userId: session.user.id,
      }),
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

export async function getRagResourcesAction({
  limit = 20,
  offset = 0,
  filter = "",
}: {
  limit?: number;
  offset?: number;
  filter?: string;
}): Promise<{
  resources: Array<{ title: string; url: string | null }>;
  hasMore: boolean;
}> {
  const validated = paginationSchema.parse({ limit, offset, filter });
  const session = await getSession();

  if (!session?.user) {
    return {
      resources: [],
      hasMore: false,
    };
  }

  return getUniqueResourceTitlesByUserIdPaginated({
    userId: session.user.id,
    limit: validated.limit,
    offset: validated.offset,
    filter: validated.filter,
  });
}

// Project Resource Actions

export async function addResourceToProjectAction(
  resourceId: string,
  projectId: string,
): Promise<ProcessResult> {
  const validatedResourceId = resourceIdSchema.parse(resourceId);
  const validatedProjectId = projectIdSchema.parse(projectId);

  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    await transaction(
      addResourceToProject({
        projectId: validatedProjectId,
        resourceId: validatedResourceId,
      }),
    );

    revalidatePath(`/project/${projectId}/edit`);
    revalidatePath(`/project/${projectId}/add`);

    return { success: true };
  } catch (error) {
    console.error("Error in addResourceToProjectAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function removeResourceFromProjectAction(
  resourceId: string,
  projectId: string,
): Promise<ProcessResult> {
  const validatedResourceId = resourceIdSchema.parse(resourceId);
  const validatedProjectId = projectIdSchema.parse(projectId);

  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    // First, check if the resource has a userId
    const resourceData = await getResourceById(resourceId);

    if (!resourceData) {
      return { success: false, error: "Resource not found" };
    }

    // If resource has no userId, it was created only for the project, so delete it completely
    if (!resourceData.userId) {
      const [deleted] = await transaction(
        deleteResourceById({ resourceId: validatedResourceId }),
      );

      if (deleted.length === 0) {
        return { success: false, error: "Failed to delete resource" };
      }

      console.log("Resource deleted successfully");

      revalidatePath(`/project/${validatedProjectId}/edit`);
      revalidatePath(`/project/${validatedProjectId}/add`);

      return { success: true };
    }

    // Otherwise, just remove the relationship
    const [result] = await transaction(
      removeResourceFromProject({
        projectId: validatedProjectId,
        resourceId: validatedResourceId,
      }),
    );

    if (result.length === 0) {
      return { success: false, error: "Resource not found in project" };
    }

    revalidatePath(`/project/${projectId}/edit`);
    revalidatePath(`/project/${projectId}/add`);

    return { success: true };
  } catch (error) {
    console.error("Error in removeResourceFromProjectAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function getProjectResourcesAction({
  projectId,
  limit = 20,
  offset = 0,
  filter = "",
}: {
  projectId: string;
  limit?: number;
  offset?: number;
  filter?: string;
}): Promise<{
  resources: Array<{ id: string; title: string; url: string | null }>;
  hasMore: boolean;
}> {
  const validatedProjectId = projectIdSchema.parse(projectId);
  const validatedPagination = paginationSchema.parse({ limit, offset, filter });
  const session = await getSession();

  if (!session?.user || !validatedProjectId) {
    return {
      resources: [],
      hasMore: false,
    };
  }

  return getProjectResourcesPaginated({
    projectId: validatedProjectId,
    limit: validatedPagination.limit,
    offset: validatedPagination.offset,
    filter: validatedPagination.filter,
  });
}

export async function getUserResourcesNotInProjectAction({
  projectId,
  limit = 20,
  offset = 0,
  filter = "",
}: {
  projectId: string;
  limit?: number;
  offset?: number;
  filter?: string;
}): Promise<{
  resources: Array<{ id: string; title: string; url: string | null }>;
  hasMore: boolean;
}> {
  const validatedProjectId = projectIdSchema.parse(projectId);
  const validatedPagination = paginationSchema.parse({ limit, offset, filter });

  const session = await getSession();

  if (!session?.user || !validatedProjectId) {
    return {
      resources: [],
      hasMore: false,
    };
  }

  return getUserResourcesNotInProject({
    userId: session.user.id,
    projectId: validatedProjectId,
    limit: validatedPagination.limit,
    offset: validatedPagination.offset,
    filter: validatedPagination.filter,
  });
}
