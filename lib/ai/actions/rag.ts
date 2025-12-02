"use server";

import { redirect } from "next/navigation";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  generateChunks,
  generateEmbeddings,
} from "@/lib/ai/rag/generate-embeddings";
import {
  createEmbeddings,
  createResource,
  deleteResources,
  deleteResourcesByTitle,
  transaction,
} from "@/lib/db/queries";
import type { InsertEmbedding, Resource as DBResource } from "@/lib/db/schema";

import type { Resource } from "@/lib/ai/types";

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
      const urlResource = await fetchAndConvertURL({ url, container: "#content",
  excludeSelectors: ["[aria-labelledby=\"see_also\"]", "[aria-labelledby=\"feedback\"]"], });
      if (urlResource) {
        const chunkResult = await saveResource(urlResource, session.user.id);
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
        const urlResource = await fetchAndConvertURL({
          url,
          container,
          excludeSelectors,
        });

        if (urlResource) {
          const chunkResult = await saveResource(
            urlResource,
            session.user.id
          );
          result.resourcesCreated += chunkResult.resourcesCreated;
          result.embeddingsCreated += chunkResult.embeddingsCreated;
        }
      }
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
      for (const resource of resources) {
        const chunkResult = await saveResource(resource, session.user.id);
        result.resourcesCreated += chunkResult.resourcesCreated;
        result.embeddingsCreated += chunkResult.embeddingsCreated;
      }
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

turndownService.addRule("removeDistractions", {
  filter: ["script", "style", "nav", "header", "footer", "aside", "form", "iframe", "button", "input", "select", "textarea", "noscript", "canvas", "dialog", "menu"],
  replacement: () => "",
});

turndownService.addRule("removeGenericDistractions", {
  filter: function (node) {
    // Solo aplicamos esto a bloques genéricos, no a parrafos de texto real
    if (node.nodeName === 'P' || node.nodeName === 'H1' || node.nodeName === 'H2') return false;

    // Obtenemos clases e IDs
    const attrs = (node.getAttribute("class") || "") + " " + (node.getAttribute("id") || "");
    const lowerAttrs = attrs.toLowerCase();

    // Palabras clave de cosas que NO queremos indexar
    const noiseKeywords = [
      "share", "social", "cookie", "banner", "popup", "modal",
      "newsletter", "promo", "advert", "related", "recommend",
      "sidebar", "comment", "feedback", "meta", "hidden", "toc"
    ];

    // Si contiene alguna palabra clave de ruido, lo borramos
    return noiseKeywords.some(keyword => lowerAttrs.includes(keyword));
  },
  replacement: function () {
    return "";
  }
});

async function fetchAndConvertURL({
  url,
  container,
  excludeSelectors,
}: {
  url: string;
  container?: string;
  excludeSelectors?: string[];
}): Promise<Resource | null> {
  try {
    console.log(`Fetching URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RAG-Bot/1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Convert HTML to Markdown
    const markdown = turndownService
      .turndown(extractContainer({ container, html, excludeSelectors }))
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

interface ExtractOptions {
  html: string;
  container?: string;
  excludeSelectors?: string[]; // Nueva propiedad opcional
}

const extractContainer = ({
  container,
  html,
  excludeSelectors = [],
}: ExtractOptions): HTMLElement => {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // 1. Seleccionar el elemento raíz (Container o Body)
  let rootElement: HTMLElement | null = null;

  if (container) {
    rootElement = doc.querySelector<HTMLElement>(container);
  }

  // Si no se especificó container o no se encontró, usamos el body
  const finalElement = rootElement ?? doc.body;

  // 2. Limpieza de Ruido (Sanitización del DOM)
  if (excludeSelectors.length > 0 && finalElement) {
    try {
      // Unimos todos los selectores en un solo string (ej: "nav, .footer, .ad-banner")
      // Esto es más eficiente que hacer un querySelectorAll por cada selector.
      const combinedSelector = excludeSelectors.join(", ");

      // Buscamos los elementos a eliminar SOLO dentro de nuestro finalElement
      const elementsToRemove = finalElement.querySelectorAll(combinedSelector);

      elementsToRemove.forEach((el) => {
        el.remove(); // Eliminación segura del nodo del árbol DOM
      });
    } catch (error) {
      console.warn("Error cleaning DOM selectors:", error);
      // Continuamos sin limpiar si falla un selector mal formado
    }
  }

  return finalElement;
};



const saveResource = async (
  resource: Resource,
  userId: string
): Promise<{ resourcesCreated: number; embeddingsCreated: number }> => {
  const [result] = await transaction(async (tx) => {
    const createdResources: DBResource[] = [];


    // 1. Create all resources and generate chunks
    const newResource = await createResource({
      title: resource.title,
      url: resource.url,
      userId,
    })(tx);

    createdResources.push(newResource);

    const resourceChunks = await generateChunks(resource.content);

    // 2. Generate embeddings for ALL chunks in one go (batched internally)
    // This maximizes the "100 values per request" limit
    const embeddings = await generateEmbeddings(resourceChunks);

    // 3. Insert all embeddings
    if (embeddings.length > 0) {
      const insertEmbeddings: InsertEmbedding[] = embeddings.map(
        ({ content, embedding, metadata, parent }) => ({
          resourceId: newResource.id,
          parent,
          content,
          embedding,
          metadata,
        })
      );

      await createEmbeddings(insertEmbeddings)(tx);

      return {
        resourcesCreated: createdResources.length,
        embeddingsCreated: insertEmbeddings.length,
      };
    }

    return {
      resourcesCreated: createdResources.length,
      embeddingsCreated: 0,
    };
  });

  return result;
};


