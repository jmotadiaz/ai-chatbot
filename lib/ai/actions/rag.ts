"use server";

import { redirect } from "next/navigation";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  generateMarkdownChunks,
  throttledGenerateEmbeddings,
} from "@/lib/ai/rag/generate-embeddings";
import {
  createEmbeddings,
  createResource,
  deleteResources,
  deleteResourcesByTitle,
  transaction,
} from "@/lib/db/queries";
import { InsertEmbedding, Resource as DBResource } from "@/lib/db/schema";
import { isDefined } from "@/lib/utils";
import { Resource } from "@/lib/ai/types";

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
  const result = { resourcesCreated: 0, embeddingsCreated: 0 };

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const jsonFile = formData.get("jsonFile") as File;
    const markdownFilesCount = parseInt(
      (formData.get("markdownFilesCount") as string) || "0"
    );
    const url = formData.get("url") as string;

    if (!jsonFile && markdownFilesCount === 0 && !url) {
      return { success: false, error: "No files provided" };
    }

    if (url) {
      const urlResource = await fetchAndConvertURL({ url });
      if (urlResource) {
        const chunkResult = await saveResources([urlResource], session.user.id);
        result.resourcesCreated += chunkResult.resourcesCreated;
        result.embeddingsCreated += chunkResult.embeddingsCreated;
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

      const { urls, container } = jsonData as {
        urls: string[];
        container?: string;
      };

      if (urls.length === 0) {
        return { success: false, error: "No URLs provided in JSON file" };
      }

      if (process.env.NODE_ENV === "production" && urls.length > 100) {
        return { success: false, error: "Max 100 URLs" };
      }

      await forEachChunk(urls, async (chunkUrls) => {
        const resourcesChunk = await Promise.all(
          chunkUrls.map((url) => fetchAndConvertURL({ url, container }))
        );
        console.log(
          `Successfully processed ${resourcesChunk.length} resources, generating embeddings...`
        );
        const chunkResult = await saveResources(
          resourcesChunk.filter(isDefined),
          session.user.id
        );
        result.resourcesCreated += chunkResult.resourcesCreated;
        result.embeddingsCreated += chunkResult.embeddingsCreated;
      });
    }

    // Process markdown files if provided
    if (markdownFilesCount > 0) {
      const resources: Resource[] = [];
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
      const chunkResult = await saveResources(
        resources.filter(isDefined),
        session.user.id
      );
      result.resourcesCreated += chunkResult.resourcesCreated;
      result.embeddingsCreated += chunkResult.embeddingsCreated;
    }

    revalidatePath("/rag");

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

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

turndownService.addRule("removeScriptAndStyle", {
  filter: ["script", "style", "nav", "header", "footer", "aside"],
  replacement: () => "",
});

async function fetchAndConvertURL({
  url,
  container,
}: {
  url: string;
  container?: string;
}): Promise<Resource | null> {
  try {
    console.log(`Fetching URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RAG-Bot/1.0)",
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Convert HTML to Markdown
    const markdown = turndownService
      .turndown(extractContainer({ container, html }))
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\s+|\s+$/g, "")
      .trim();

    return {
      title: extractTitle(html) || url,
      url,
      content: markdown,
    };
  } catch (error) {
    console.error(`Error processing URL ${url}:`, error);
    return null;
  }
}

const extractTitle = (html: string): string | null => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : null;
};

const extractContainer = ({
  container,
  html,
}: {
  container?: string;
  html: string;
}): HTMLElement | string => {
  if (!container) {
    return html;
  }
  const dom = new JSDOM(html);
  const el = dom.window.document.querySelector<HTMLElement>(container);

  return el ?? dom.window.document.body;
};

const resourceToEmbeddings = async ({
  resource,
  content,
}: {
  resource: DBResource;
  content: string;
}): Promise<InsertEmbedding[]> => {
  const chunks = await generateMarkdownChunks(content);
  const embeddingData = await throttledGenerateEmbeddings(chunks);

  // Prepare embeddings for database insertion
  return embeddingData.map(({ content, embedding }) => ({
    resourceId: resource.id,
    content,
    embedding,
  }));
};

const saveResources = async (
  resources: Resource[],
  userId: string
): Promise<{ resourcesCreated: number; embeddingsCreated: number }> => {
  const [result] = await transaction(async (tx) => {
    const createdResources = [];
    const allEmbeddings: Promise<InsertEmbedding[]>[] = [];

    // Process each resource
    for (const resource of resources) {
      // Create resource
      const newResource = await createResource({
        title: resource.title,
        url: resource.url,
        userId,
      })(tx);

      createdResources.push(newResource);

      allEmbeddings.push(
        resourceToEmbeddings({
          resource: newResource,
          content: resource.content,
        })
      );
    }

    // Batch insert all embeddings
    if (allEmbeddings.length > 0) {
      const createdEmbeddings = await createEmbeddings(
        (await Promise.all(allEmbeddings)).flat()
      )(tx);
      return {
        resourcesCreated: createdResources.length,
        embeddingsCreated: createdEmbeddings.length,
      };
    }

    return {
      resourcesCreated: createdResources.length,
      embeddingsCreated: 0,
    };
  });

  return result;
};

const forEachChunk = async <T>(
  array: T[],
  callback: (chunk: T[]) => Promise<void>,
  n: number = 50
): Promise<void> => {
  if (n <= 0) {
    throw new Error("El tamaño del subarray debe ser mayor que 0");
  }

  for (let i = 0; i < array.length; i += n) {
    const chunk = array.slice(i, i + n);
    await callback(chunk);
  }
};
