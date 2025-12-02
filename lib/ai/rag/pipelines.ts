import { generateEmbeddings, QueryType } from "@/lib/ai/rag/embeddings";
import { createEmbeddings, createResource, SimilarChunks, transaction } from "@/lib/db/queries";
import type { InsertEmbedding } from "@/lib/db/schema";
import { fetchAndConvertURL, UrlResource } from "@/lib/ai/rag/fetch";
import { rerankResources, vectorSearch } from "@/lib/ai/rag/search";
import { ChatbotMessage } from "@/lib/ai/types";
import { generateChunks } from "@/lib/ai/rag/chunking";

export const saveUrlResource = async (
  urlResource: UrlResource,
  userId: string
): Promise<{ success: boolean }> => {
  const resource = await fetchAndConvertURL(urlResource);

  if (!resource) {
    return {
      success: false,
    };
  }

  const [result] = await transaction(async (tx) => {

    // 1. Create all resources and generate chunks
    const newResource = await createResource({
      title: resource.title,
      url: resource.url,
      userId,
    })(tx);

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
        success: true,
      };
    }

    return {
      success: false,
    };
  });

  return result;
};

export interface RetrieveResourcesInput {
  multiHopQueries: string[];
  queryRewriting: string;
  queryType?: QueryType;
  messages: ChatbotMessage[];
  userId: string;
  limit?: number;
}

const K_VECTOR_SEARCHES = 10;
const VECTOR_SEARCH_SIMILARITY_THRESHOLD = 0.50;

function extractEmbeddingParentsFromMessages(messages: ChatbotMessage[]): string[] {
  const embeddingIds: string[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "tool-rag") {
        embeddingIds.push(...(part.output?.map(({ content }) => content) || []));
      }
    }
  }

  return [...new Set(embeddingIds)]; // Remove duplicates
}

export const retrieveResources = async ({
  multiHopQueries,
  queryRewriting,
  queryType,
  messages,
  userId,
  limit = 6,
}: RetrieveResourcesInput) => {
  const results = await Promise.all(
    multiHopQueries.map((query) =>
      vectorSearch({
        query,
        queryType,
        userId,
        limit: K_VECTOR_SEARCHES,
        similarityThreshold: VECTOR_SEARCH_SIMILARITY_THRESHOLD,
        excludeParents: extractEmbeddingParentsFromMessages(messages),
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

  return finalResults.map(({parent, metadata, resourceTitle, resourceUrl}) => {
    return ({
      resourceTitle,
      resourceUrl,
      content: parent,
      metadata: JSON.stringify(metadata),
    })
  });
}
