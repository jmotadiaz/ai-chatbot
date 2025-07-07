"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createEmbeddings,
  createResource,
  deleteChat as deleteDBChat,
  deleteProject as deleteDBProject,
  transaction,
} from "@/lib/db/queries";
import { auth } from "@/auth";
import { InsertEmbedding } from "@/lib/db/schema";
import {
  generateEmbeddings,
  generateMarkdownChunks,
} from "@/lib/ai/generate-embeddings";
import { fetchAndConvertURL } from "@/lib/utils";

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

interface ProcessResult {
  success: boolean;
  resourcesCreated?: number;
  embeddingsCreated?: number;
  error?: string;
}

export async function uploadRAGResources(
  formData: FormData
): Promise<ProcessResult> {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const jsonFile = formData.get("jsonFile") as File;
    const markdownFilesCount = parseInt(
      (formData.get("markdownFilesCount") as string) || "0"
    );

    if (!jsonFile && markdownFilesCount === 0) {
      return { success: false, error: "No files provided" };
    }

    const resources: { title: string; content: string }[] = [];

    // Process JSON file with URLs if provided
    if (jsonFile) {
      console.log("Processing JSON file with URLs...");

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

      const urls = jsonData.urls as string[];

      if (urls.length === 0) {
        return { success: false, error: "No URLs provided in JSON file" };
      }

      if (process.env.NODE_ENV === "production" && urls.length > 50) {
        return { success: false, error: "Maximum 50 URLs allowed per batch" };
      }

      console.log(`Processing ${urls.length} URLs...`);

      // Fetch and convert URLs in parallel (with concurrency limit)
      const BATCH_SIZE = 10;

      for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batch = urls.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(fetchAndConvertURL);
        const batchResults = await Promise.all(batchPromises);

        // Filter out null results and map to simplified format
        const urlResources = batchResults.filter(Boolean).map((resource) => ({
          title: resource!.title,
          content: resource!.content,
        }));

        resources.push(...urlResources);
      }
    }

    // Process markdown files if provided
    if (markdownFilesCount > 0) {
      console.log(`Processing ${markdownFilesCount} markdown files...`);

      for (let i = 0; i < markdownFilesCount; i++) {
        const markdownFile = formData.get(`markdownFile_${i}`) as File;

        if (markdownFile) {
          const content = await markdownFile.text();

          // Extract title from filename (remove extension)
          const title = markdownFile.name.replace(/\.(md|mdx)$/i, "");

          resources.push({
            title,
            content,
          });
        }
      }
    }

    if (resources.length === 0) {
      return { success: false, error: "No valid resources could be processed" };
    }

    console.log(
      `Successfully processed ${resources.length} resources, generating embeddings...`
    );

    // Process embeddings and save to database using transactions
    let totalEmbeddingsCreated = 0;

    const result = await transaction(async (tx) => {
      const createdResources = [];
      const allEmbeddings: InsertEmbedding[] = [];

      // Process each resource
      for (const resource of resources) {
        // Create resource
        const newResource = await createResource({
          title: resource.title,
        })(tx);

        createdResources.push(newResource);

        // Generate embeddings for the markdown content
        const chunks = await generateMarkdownChunks(resource.content);
        const embeddingData = await generateEmbeddings(chunks);

        // Prepare embeddings for database insertion
        const resourceEmbeddings: InsertEmbedding[] = embeddingData.map(
          ({ content, embedding }) => ({
            resourceId: newResource.id,
            content,
            embedding,
          })
        );

        allEmbeddings.push(...resourceEmbeddings);
      }

      // Batch insert all embeddings
      if (allEmbeddings.length > 0) {
        const createdEmbeddings = await createEmbeddings(allEmbeddings)(tx);
        totalEmbeddingsCreated = createdEmbeddings.length;
      }

      return {
        resourcesCreated: createdResources.length,
        embeddingsCreated: totalEmbeddingsCreated,
      };
    });

    console.log(
      `Completed: ${result.resourcesCreated} resources, ${result.embeddingsCreated} embeddings`
    );

    return {
      success: true,
      resourcesCreated: result.resourcesCreated,
      embeddingsCreated: result.embeddingsCreated,
    };
  } catch (error) {
    console.error("Error in uploadRAGResources:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
