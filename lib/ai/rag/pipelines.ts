import { randomUUID } from "crypto"; // Node.js crypto nativo
import { generateEmbeddings, QueryType } from "@/lib/ai/rag/embeddings";
import { createEmbeddings, saveResource, saveChunks, SimilarChunks, transaction } from "@/lib/db/queries";
import type { InsertChunk } from "@/lib/db/schema";
import { fetchAndConvertURL, UrlResource } from "@/lib/ai/rag/fetch";
import { rerankResources, vectorSearch } from "@/lib/ai/rag/search";
import { generateChunks } from "@/lib/ai/rag/chunking";
import { RagChunk } from "@/lib/ai/rag/types";

export const saveUrlResource = async (
  urlResource: UrlResource,
  userId: string
): Promise<{ success: boolean }> => {
  const resource = await fetchAndConvertURL(urlResource);

  if (!resource) {
    return { success: false };
  }

  const [result] = await transaction(async (tx) => {
    // 1. Crear el Recurso (Resource)
    const newResource = await saveResource({
      title: resource.title,
      url: resource.url,
      userId,
    })(tx);

    // 2. Generar Chunk Groups
    const chunkGroups = await generateChunks(resource.content);

    // A. Preparar datos asignando UUIDs en la aplicación
    const chunksToInsert: InsertChunk[] = [];
    const contentToEmbed: { chunkId: string; content: string }[] = [];

    for (const {content, type, language, boundaryType, boundaryName, embeddableContent} of chunkGroups) {
      // Generamos el ID aquí, explícitamente
      const chunkId = randomUUID();

      // Preparamos el Chunk Padre para DB
      chunksToInsert.push({
        id: chunkId, // <--- ID pre-generado
        resourceId: newResource.id,
        content,
        type,
        language,
        boundaryType,
        boundaryName,
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

export interface RetrieveResourcesInput {
  multiHopQueries: string[];
  queryRewriting: string;
  previousChunks: string[];
  queryType?: QueryType;
  userId: string;
  limit?: number;
}

const K_VECTOR_SEARCHES = 10;
const VECTOR_SEARCH_SIMILARITY_THRESHOLD = 0.50;

export const retrieveResources = async ({
  multiHopQueries,
  queryRewriting,
  previousChunks,
  queryType,
  userId,
  limit = 6,
}: RetrieveResourcesInput): Promise<RagChunk[]> => {
  const results = await Promise.all(
    multiHopQueries.map((query) =>
      vectorSearch({
        query,
        queryType,
        userId,
        limit: K_VECTOR_SEARCHES,
        similarityThreshold: VECTOR_SEARCH_SIMILARITY_THRESHOLD,
        previousChunkIds: previousChunks,
      })
    )
  );

  const vectorSearchResults: SimilarChunks = [];

  for (const result of results) {
    if (result.success && result.similarChunks) {
      vectorSearchResults.push(...result.similarChunks);
    } else if (!result.success) {
      console.warn("One of the RAG queries failed:", result.error);
    }
  }

  if (vectorSearchResults.length === 0) {
    console.error("No resources or similar chunks found for any query");
    return [];
  }

  const finalResults = await rerankResources({
      query: queryRewriting,
      resources: vectorSearchResults,
      topN: limit,
    });

  return finalResults.map(({id, content, resourceTitle, resourceUrl}) => {
    return ({
      id,
      resourceTitle,
      resourceUrl,
      content,
    })
  });
}
