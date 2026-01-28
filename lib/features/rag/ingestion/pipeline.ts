import { randomUUID } from "crypto";
import { createEmbeddings, saveResource, saveChunks } from "../queries";
import { generateEmbeddings } from "./embeddings";
import { fetchAndConvertURL, UrlResource } from "./fetch";
import { generateChunks } from "./chunking";
import { transaction } from "@/lib/infrastructure/db/queries";
import type { InsertChunk } from "@/lib/infrastructure/db/schema";

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

  const [result] = await transaction(async (tx) => {
    // 1. Crear el Recurso (Resource)
    const newResource = await saveResource({
      title: resource.title,
      url: resource.url,
      userId: !!projectId ? undefined : userId,
      projectId,
    })(tx);

    // 2. Generar Chunk Groups
    const chunkGroups = await generateChunks(resource.content);

    // A. Preparar datos asignando UUIDs en la aplicación
    const chunksToInsert: InsertChunk[] = [];
    const contentToEmbed: { chunkId: string; content: string }[] = [];

    for (const { content, type, language, embeddableContent } of chunkGroups) {
      // Generamos el ID aquí, explícitamente
      const chunkId = randomUUID();

      // Preparamos el Chunk Padre para DB
      chunksToInsert.push({
        id: chunkId, // <--- ID pre-generado
        resourceId: newResource.id,
        content,
        type,
        language,
      });

      // Preparamos los hijos para Embeddings vinculados a ese ID
      // (Small-to-Big: el embedding del hijo apunta al chunk padre)
      for (const childContent of embeddableContent) {
        contentToEmbed.push({
          chunkId: chunkId, // Vinculamos al ID generado arriba
          content: childContent,
        });
      }
    }

    // B. Insertar Chunks (ya tienen ID, no dependemos del retorno ordenado de la DB)
    await saveChunks(chunksToInsert)(tx);

    // C. Generar Embeddings (usando la lista plana con IDs explícitos)
    const embeddingsToInsert = await generateEmbeddings(contentToEmbed);

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
  const [result] = await transaction(async (tx) => {
    // 1. Crear el Recurso (Resource)
    const newResource = await saveResource({
      title,
      url: null,
      userId: !!projectId ? undefined : userId,
      projectId,
    })(tx);

    // 2. Generar Chunk Groups
    const chunkGroups = await generateChunks(content);

    // A. Preparar datos asignando UUIDs en la aplicación
    const chunksToInsert: InsertChunk[] = [];
    const contentToEmbed: { chunkId: string; content: string }[] = [];

    for (const { content, type, language, embeddableContent } of chunkGroups) {
      // Generamos el ID aquí, explícitamente
      const chunkId = randomUUID();

      // Preparamos el Chunk Padre para DB
      chunksToInsert.push({
        id: chunkId, // <--- ID pre-generado
        resourceId: newResource.id,
        content,
        type,
        language,
      });

      // Preparamos los hijos para Embeddings vinculados a ese ID
      // (Small-to-Big: el embedding del hijo apunta al chunk padre)
      for (const childContent of embeddableContent) {
        contentToEmbed.push({
          chunkId: chunkId, // Vinculamos al ID generado arriba
          content: childContent,
        });
      }
    }

    // B. Insertar Chunks (ya tienen ID, no dependemos del retorno ordenado de la DB)
    await saveChunks(chunksToInsert)(tx);

    // C. Generar Embeddings (usando la lista plana con IDs explícitos)
    const embeddingsToInsert = await generateEmbeddings(contentToEmbed);

    if (embeddingsToInsert.length > 0) {
      await createEmbeddings(embeddingsToInsert)(tx);
      return { success: true };
    }

    return { success: false };
  });

  return result;
};
