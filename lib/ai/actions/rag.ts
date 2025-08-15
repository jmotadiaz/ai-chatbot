"use server";

import { redirect } from "next/navigation";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { auth } from "@/auth";
import {
  generateEmbeddings,
  generateMarkdownChunks,
} from "@/lib/ai/rag/generate-embeddings";
import {
  createEmbeddings,
  createResource,
  transaction,
} from "@/lib/db/queries";
import { InsertEmbedding, Resource as DBResource } from "@/lib/db/schema";
import { isDefined } from "@/lib/utils";

export interface Resource {
  title: string;
  content: string;
}

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

    const resources: { title: string; content: string }[] = [];

    if (url) {
      const urlResource = await fetchAndConvertURL({ url });
      if (urlResource) {
        resources.push(urlResource);
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

      if (process.env.NODE_ENV === "production" && urls.length > 50) {
        return { success: false, error: "Maximum 50 URLs allowed per batch" };
      }

      const batchResults = await Promise.all(
        urls.map((url) => fetchAndConvertURL({ url, container }))
      );

      resources.push(...batchResults.filter(isDefined));
    }

    // Process markdown files if provided
    if (markdownFilesCount > 0) {
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

    const [result] = await transaction(async (tx) => {
      const createdResources = [];
      const allEmbeddings: Promise<InsertEmbedding[]>[] = [];

      // Process each resource
      for (const resource of resources) {
        // Create resource
        const newResource = await createResource({
          title: resource.title,
          userId: session.user.id,
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
      .turndown(container ? extractContainer({ container, html }) : html)
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\s+|\s+$/g, "")
      .trim();

    return {
      title: url,
      content: markdown,
    };
  } catch (error) {
    console.error(`Error processing URL ${url}:`, error);
    return null;
  }
}

const extractContainer = ({
  container,
  html,
}: {
  container: string;
  html: string;
}): HTMLElement => {
  const dom = new JSDOM(html);
  return (
    dom.window.document.querySelector(container) ?? dom.window.document.body
  );
};

const resourceToEmbeddings = async ({
  resource,
  content,
}: {
  resource: DBResource;
  content: string;
}): Promise<InsertEmbedding[]> => {
  const chunks = await generateMarkdownChunks(content);
  const embeddingData = await generateEmbeddings(chunks);

  // Prepare embeddings for database insertion
  return embeddingData.map(({ content, embedding }) => ({
    resourceId: resource.id,
    content,
    embedding,
  }));
};
