import { randomUUID } from "crypto";
import { generateChunks } from "./chunking";
import { fetchAndConvertURL, type UrlResource } from "./fetch";
import type { RagIngestionDbPort, RagIngestionAiPort } from "./ports";
import type {
  InsertChunk,
  InsertEmbedding,
} from "@/lib/infrastructure/db/schema";

export const makeIngestUrlResource = <Tx = unknown>(
  db: RagIngestionDbPort<Tx>,
  ai: RagIngestionAiPort,
) => {
  return async ({
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
    const chunkGroups = await generateChunks(resource.content, resource.title);

    const chunksToInsert: Omit<InsertChunk, "resourceId">[] = [];
    const contentToEmbed: { chunkId: string; content: string }[] = [];

    for (const [
      index,
      { content, type, language, embeddableContent },
    ] of chunkGroups.entries()) {
      const chunkId = randomUUID();

      // Prepare Chunk data (we need resourceId later, but we can assign chunkId now)
      chunksToInsert.push({
        id: chunkId,
        position: index,
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
    let embeddingsToInsert: InsertEmbedding[] = [];
    if (contentToEmbed.length > 0) {
      embeddingsToInsert = await ai.generateEmbeddings(contentToEmbed);
    }

    // 3. Database Write - Inside Transaction (Fast)
    const [result] = await db.transaction(async (tx) => {
      // A. Create Resource
      const newResource = await db.saveResource({
        title: resource.title,
        url: resource.url,
        userId: !!projectId ? undefined : userId,
        projectId,
      })(tx);

      // B. Insert Chunks
      await db.saveChunks(
        chunksToInsert.map((chunk) => ({
          ...chunk,
          resourceId: newResource.id,
        })),
      )(tx);

      // C. Insert Embeddings
      if (embeddingsToInsert.length > 0) {
        await db.createEmbeddings(embeddingsToInsert)(tx);
        return { success: true };
      }

      return { success: false };
    });

    return result as { success: boolean };
  };
};

export const makeIngestMarkdownResource = <Tx = unknown>(
  db: RagIngestionDbPort<Tx>,
  ai: RagIngestionAiPort,
) => {
  return async ({
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
    const chunkGroups = await generateChunks(content, title);

    const chunksToInsert: InsertChunk[] = [];
    const contentToEmbed: { chunkId: string; content: string }[] = [];

    for (const [
      index,
      { content: textContent, type, language, embeddableContent },
    ] of chunkGroups.entries()) {
      const chunkId = randomUUID();

      chunksToInsert.push({
        id: chunkId,
        position: index,
        resourceId: "" as string, // Placeholder
        content: textContent,
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
      embeddingsToInsert = await ai.generateEmbeddings(contentToEmbed);
    }

    // 3. Database Write - Inside Transaction (Fast)
    const [result] = await db.transaction(async (tx) => {
      // A. Create Resource
      const newResource = await db.saveResource({
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
      await db.saveChunks(chunksToInsert)(tx);

      // D. Insert Embeddings
      if (embeddingsToInsert.length > 0) {
        await db.createEmbeddings(embeddingsToInsert)(tx);
        return { success: true };
      }

      return { success: false };
    });

    return result as { success: boolean };
  };
};
