import { InferUITools, tool, ToolSet } from "ai";
import { z } from "zod";

import { retrieve } from "@/lib/ai/rag/retrieve";
import type { ChatbotMessage } from "@/lib/ai/types";
import { RAG_TOOL } from "@/lib/ai/tools/types";
import type { SimilarChunk } from "@/lib/db/queries";

export interface RagFactoryArgs {
  messages: ChatbotMessage[];
  userId: string;
}

import { QUERY_TYPES } from "@/lib/ai/rag/generate-embeddings";

export type RagChunk = Pick<
  SimilarChunk,
  "id" | "content" | "resourceTitle" | "resourceUrl"
>;

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

export const ragFactory = ({ userId, messages }: RagFactoryArgs) =>
  ({
    [RAG_TOOL]: tool({
      description:
        "Get information from your knowledge base to answer questions.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(500)
          .describe(
            "The search query. It should be in english and optimized for rag search."
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
      execute: async ({ query, queryType }): Promise<Array<RagChunk>> => {
        console.log("RAG tool called with query:", query);
        console.log("RAG tool called with queryType:", queryType);

        const { similarChunks } = await retrieve({
          query,
          queryType,
          userId,
          excludeEmbeddingIds: extractEmbeddingIdsFromMessages(messages),
        });

        if (!similarChunks) {
          console.error("No resources or similar chunks found");
          return [];
        }

        return similarChunks.map(
          ({ id, content, resourceTitle, resourceUrl }) => ({
            id,
            content,
            resourceTitle,
            resourceUrl,
          })
        );
      },
    }),
  } satisfies ToolSet);

export type RagTool = InferUITools<ReturnType<typeof ragFactory>>;
