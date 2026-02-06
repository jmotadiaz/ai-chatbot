import { randomUUID } from "crypto";
import { createEmbeddings, saveResource, saveChunks } from "../queries";
import { generateEmbeddings } from "./embeddings";
import { fetchAndConvertURL, UrlResource } from "./fetch";
import { generateChunks } from "./chunking";
import { transaction } from "@/lib/infrastructure/db/queries";
import type {
  InsertChunk,
  InsertEmbedding,
} from "@/lib/infrastructure/db/schema";

export const saveUrlResource = async ({
  urlResource,
  userId,
  projectId,
}: {
  urlResource: UrlResource;
  userId: string;
  projectId?: string;
}): Promise<{ success: boolean }> => {
  const resource = await fetchAndConvertURL(urlResource);

  if (!resource) {
    return { success: false };
  }

  // 1. Prepare data (CPU work) - Outside transaction
  const chunkGroups = await generateChunks(resource.content);

  const chunksToInsert: Omit<InsertChunk, "resourceId">[] = [];
  const contentToEmbed: { chunkId: string; content: string }[] = [];

  for (const { content, type, language, embeddableContent } of chunkGroups) {
    const chunkId = randomUUID();

    // Prepare Chunk data (we need resourceId later, but we can assign chunkId now)
    chunksToInsert.push({
      id: chunkId,
      content,
      type,
      language,
    });

    // Prepare content for embeddings
    for (const childContent of embeddableContent) {
      contentToEmbed.push({
        chunkId: chunkId,
        content: childContent,
      });
    }
  }

  // 2. Generate Embeddings (External API I/O) - Outside transaction!
  // This is the critical fix: prevent holding DB connection during slow API call
  let embeddingsToInsert: InsertEmbedding[] = [];
  if (contentToEmbed.length > 0) {
    embeddingsToInsert = await generateEmbeddings(contentToEmbed);
  }

  // 3. Database Write - Inside Transaction (Fast)
  const [result] = await transaction(async (tx) => {
    // A. Create Resource
    const newResource = await saveResource({
      title: resource.title,
      url: resource.url,
      userId: !!projectId ? undefined : userId,
      projectId,
    })(tx);

    // B. Insert Chunks
    await saveChunks(
      chunksToInsert.map((chunk) => ({ ...chunk, resourceId: newResource.id })),
    )(tx);

    // C. Insert Embeddings
    if (embeddingsToInsert.length > 0) {
      await createEmbeddings(embeddingsToInsert)(tx);
      return { success: true };
    }

    return { success: false };
  });

  return result;
};

export const saveMarkdownResource = async ({
  title,
  content,
  projectId,
  userId,
}: {
  title: string;
  content: string;
  userId: string;
  projectId?: string;
}): Promise<{ success: boolean }> => {
  // 1. Prepare data (CPU work) - Outside transaction
  const chunkGroups = await generateChunks(content);

  const chunksToInsert: InsertChunk[] = [];
  const contentToEmbed: { chunkId: string; content: string }[] = [];

  for (const { content, type, language, embeddableContent } of chunkGroups) {
    const chunkId = randomUUID();

    chunksToInsert.push({
      id: chunkId,
      resourceId: "" as string, // Placeholder
      content,
      type,
      language,
    });

    for (const childContent of embeddableContent) {
      contentToEmbed.push({
        chunkId: chunkId,
        content: childContent,
      });
    }
  }

  // 2. Generate Embeddings (External API I/O) - Outside transaction!
  let embeddingsToInsert: InsertEmbedding[] = [];
  if (contentToEmbed.length > 0) {
    embeddingsToInsert = await generateEmbeddings(contentToEmbed);
  }

  // 3. Database Write - Inside Transaction (Fast)
  const [result] = await transaction(async (tx) => {
    // A. Create Resource
    const newResource = await saveResource({
      title,
      url: null,
      userId: !!projectId ? undefined : userId,
      projectId,
    })(tx);

    // B. Fix up resourceId in chunks
    chunksToInsert.forEach((chunk) => {
      chunk.resourceId = newResource.id;
    });

    // C. Insert Chunks
    await saveChunks(chunksToInsert)(tx);

    // D. Insert Embeddings
    if (embeddingsToInsert.length > 0) {
      await createEmbeddings(embeddingsToInsert)(tx);
      return { success: true };
    }

    return { success: false };
  });

  return result;
};
