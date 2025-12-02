import { InferUITools, tool, ToolSet } from "ai";
import { z } from "zod";
import { retrieve } from "@/lib/ai/rag/retrieve";
import type { ChatbotMessage } from "@/lib/ai/types";
import { RAG_TOOL } from "@/lib/ai/tools/types";
import type { SimilarChunk } from "@/lib/db/queries";
import { QUERY_TYPES } from "@/lib/ai/rag/generate-embeddings";
import { RagChunk } from "@/lib/ai/rag/types";
import { rerankDocuments } from "@/lib/ai/rag/rerank";

export interface RagFactoryArgs {
  messages: ChatbotMessage[];
  userId: string;
  ragMaxResources?: number;
}

const K_VECTOR_SEARCHES = 10;
const VECTOR_SEARCH_SIMILARITY_THRESHOLD = 0.50;

/**
 * Extract embedding IDs from previous messages
 */
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

export const ragFactory = ({
  userId,
  messages,
  ragMaxResources = 6,
}: RagFactoryArgs) =>
  ({
    [RAG_TOOL]: tool({
      description:
        "Advanced retrieval tool for answering complex questions from the knowledge base. It employs a Multi-hop QA strategy by decomposing the user's request into multiple sub-queries (`multiHopQueries`) to retrieve diverse information. It also requires a synthesized query (`queryRewriting`) for a subsequent reranking step to ensure high relevance. All queries must be in English.",
      inputSchema: z.object({
        multiHopQueries: z
          .array(z.string())
          .min(1)
          .max(5)
          .describe(
            "An array of search queries to perform a Multi-hop QA (max 5 queries), maximizing relevant keywords to retrieve relevant corpus segments. Each query MUST be in english and optimized for rag search."
          ),
        queryRewriting: z
          .string()
          .describe(
            "Your task is to refine the user's original query by enriching it with key concepts extracted from the generated 'multiHopQueries'. Use the original query as the structural anchor and 'decorate' it with the most significant keywords found in the multi-hop synthesis to maximize retrieval density. The output must be a single, semantically coherent query in English that preserves the user's original intent while expanding its lexical coverage."
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
      execute: async ({
        multiHopQueries,
        queryRewriting,
        queryType,
      }): Promise<Array<RagChunk>> => {
        console.log("RAG tool called with multiHopQueries:", multiHopQueries);
        console.log("RAG tool called with queryRewriting:", queryRewriting);
        console.log("RAG tool called with queryType:", queryType);

        const results = await Promise.all(
          multiHopQueries.map((query) =>
            retrieve({
              query,
              queryType,
              userId,
              limit: K_VECTOR_SEARCHES,
              similarityThreshold: VECTOR_SEARCH_SIMILARITY_THRESHOLD,
              excludeParents: extractEmbeddingParentsFromMessages(messages),
            })
          )
        );

        const vectorSearchResults: SimilarChunk[] = [];

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

        const finalResults = await rerankDocuments({
            query: queryRewriting,
            documents: vectorSearchResults,
            topN: ragMaxResources,
          });

        return finalResults.map(({parent, ...chunk}) => ({
          ...chunk,
          content: parent,
        }));
      },
    }),
  } satisfies ToolSet);

export type RagTool = InferUITools<ReturnType<typeof ragFactory>>;
