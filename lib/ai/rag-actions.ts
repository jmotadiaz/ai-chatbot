"use server";

import { redirect } from "next/navigation";
import TurndownService from "turndown";
import { auth } from "@/lib/auth/auth-config";
import { generateMarkdownEmbeddings } from "@/lib/ai/generate-embeddings";
import {
  transaction,
  createResource,
  createEmbeddings,
} from "@/lib/db/queries";
import { InsertEmbedding } from "@/lib/db/schema";

interface URLResource {
  url: string;
  title: string;
  markdown: string;
}

interface ProcessResult {
  success: boolean;
  resourcesCreated?: number;
  embeddingsCreated?: number;
  error?: string;
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// Configure turndown to handle more HTML elements properly
turndownService.addRule("removeScriptAndStyle", {
  filter: ["script", "style", "nav", "header", "footer", "aside"],
  replacement: () => "",
});

async function fetchAndConvertURL(url: string): Promise<URLResource | null> {
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
    const title = url;

    // Convert HTML to Markdown
    const markdown = turndownService.turndown(html);

    // Basic cleanup - remove excessive whitespace
    const cleanMarkdown = markdown
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\s+|\s+$/g, "")
      .trim();

    if (cleanMarkdown.length < 100) {
      console.warn(`Content too short for ${url}, skipping`);
      return null;
    }

    return {
      url,
      title,
      markdown: cleanMarkdown,
    };
  } catch (error) {
    console.error(`Error processing URL ${url}:`, error);
    return null;
  }
}

export async function uploadRAGResources(
  formData: FormData
): Promise<ProcessResult> {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const file = formData.get("file") as File;

    if (!file) {
      return { success: false, error: "No file provided" };
    }

    // Parse JSON file
    const fileContent = await file.text();
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
      return { success: false, error: "No URLs provided" };
    }

    if (urls.length > 50) {
      return { success: false, error: "Maximum 50 URLs allowed per batch" };
    }

    console.log(`Processing ${urls.length} URLs...`);

    // Fetch and convert URLs in parallel (with concurrency limit)
    const BATCH_SIZE = 5; // Process 5 URLs at a time to avoid overwhelming servers
    const resources: URLResource[] = [];

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map((url) => fetchAndConvertURL(url));
      const batchResults = await Promise.all(batchPromises);

      // Filter out null results
      resources.push(...(batchResults.filter(Boolean) as URLResource[]));
    }

    if (resources.length === 0) {
      return { success: false, error: "No valid resources could be processed" };
    }

    console.log(
      `Successfully processed ${resources.length} resources, generating embeddings...`
    );

    console.log("last page", resources.at(-1)?.markdown);

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
        const embeddingData = await generateMarkdownEmbeddings(
          resource.markdown
        );

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
