import { InferUITools, tool, ToolSet } from "ai";
import { z } from "zod";

import { retrieve } from "@/lib/ai/rag/retrieve";
import type { ChatbotMessage } from "@/lib/ai/types";
import { RAG_TOOL } from "@/lib/ai/tools/types";
import type { SimilarChunk } from "@/lib/db/queries";

import {
  defaultRagSimilarityPercentage,
  defaultRagMaxResources,
} from "@/lib/ai/models/definition";
import { QUERY_TYPES } from "@/lib/ai/rag/generate-embeddings";

export type RagChunk = Pick<
  SimilarChunk,
  "id" | "content" | "resourceTitle" | "resourceUrl"
>;

export interface RagFactoryArgs {
  messages: ChatbotMessage[];
  userId: string;
  ragMaxResources?: number;
  ragSimilarityPercentage?: number;
}

/**
 * Extract embedding IDs from previous messages
 */
function extractEmbeddingIdsFromMessages(messages: ChatbotMessage[]): string[] {
  const embeddingIds: string[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "tool-rag") {
        embeddingIds.push(...(part.output?.map(({ id }) => id) || []));
      }
    }
  }

  return [...new Set(embeddingIds)]; // Remove duplicates
}

export const ragFactory = ({
  userId,
  messages,
  ragMaxResources = defaultRagMaxResources,
  ragSimilarityPercentage = defaultRagSimilarityPercentage,
}: RagFactoryArgs) =>
  ({
    [RAG_TOOL]: tool({
      description:
        "Get information from your knowledge base to answer questions. The agent must decompose the user's question into 3 concrete sub-questions or tasks to perform a Multi-hop QA. Each query MUST be in english.",
      inputSchema: z.object({
        queries: z
          .array(z.string())
          .min(1)
          .max(5)
          .describe(
            "An array of search queries. Each query MUST be in english and optimized for rag search."
          ),
        queryType: z
          .enum(QUERY_TYPES)
          .default("RETRIEVAL_QUERY")
          .describe(
            "The type of the query, which can be either 'RETRIEVAL_QUERY' (general search queries) or 'CODE_RETRIEVAL_QUERY' (for retrieval of code blocks based on natural language queries)."
          ),
      }),
      outputSchema: z.array(
        z.object({
          id: z.string().describe("Embedding ID of the chunk."),
          content: z.string().describe("The content of the chunk."),
          resourceTitle: z.string().describe("The title of the resource."),
          resourceUrl: z
            .string()
            .nullable()
            .describe("The URL of the resource."),
        })
      ),
      execute: async ({ queries, queryType }): Promise<Array<RagChunk>> => {
        console.log("RAG tool called with queries:", queries);
        console.log("RAG tool called with queryType:", queryType);

        const results = await Promise.all(
          queries.map((query) =>
            retrieve({
              query,
              queryType,
              userId,
              limit: ragMaxResources,
              similarityThreshold: ragSimilarityPercentage / 100,
              excludeEmbeddingIds: extractEmbeddingIdsFromMessages(messages),
            })
          )
        );

        const allChunks: SimilarChunk[] = [];

        for (const result of results) {
          if (result.success && result.similarChunks) {
            allChunks.push(...result.similarChunks);
          } else if (!result.success) {
            console.warn("One of the RAG queries failed:", result.error);
          }
        }

        if (allChunks.length === 0) {
          console.error("No resources or similar chunks found for any query");
          return [];
        }

        return [...new Set<RagChunk>(allChunks.map(({ id, content, resourceTitle, resourceUrl }) => ({
            id,
            content,
            resourceTitle,
            resourceUrl,
          })))];
      },
    }),
  } satisfies ToolSet);

export type RagTool = InferUITools<ReturnType<typeof ragFactory>>;
