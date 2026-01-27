import { tool, ToolSet, UIMessage } from "ai";
import { z } from "zod";
import { QUERY_TYPES, RagChunk } from "./types";
import { retrieveResources } from "./retrieve/search";
import { extractResourceIdsFromMessages } from "./extract-resource-ids";
import { RAG_TOOL } from "@/lib/features/rag/constants";

export interface RagFactoryArgs {
  messages: UIMessage[];
  userId: string;
  projectId?: string;
  ragMaxResources?: number;
}

export const ragFactory = ({
  userId,
  projectId,
  messages,
  ragMaxResources = 6,
}: RagFactoryArgs) =>
  ({
    [RAG_TOOL]: tool({
      description: `
        Primary interface for retrieving information from the knowledge base. Use this tool whenever the user asks technical questions, requests code examples, or needs clarification on concepts documentation.

        CRITICAL: You must decompose the user's request into multiple distinct search angles to ensure full context coverage. The generated queries (multiHopQueries and queryRewriting) must be in English language.
      `,
      inputSchema: z.object({
        multiHopQueries: z.array(z.string()).min(1).max(5).describe(`
            Decompose the user's complex question into 3-5 distinct, atomic sub-queries. Each sub-query should target a specific aspect (e.g., definition, implementation, configuration, error handling) or a prerequisite piece of knowledge needed to answer the main question. \n\nStrategy: \n1. Strip conversational filler.\n2. Focus on high-value technical entities and keywords.\n3. Ensure queries are 'orthogonal' (don't repeat the same search intent twice).
          `),
        queryRewriting: z.string().describe(`
            Generate a single, fully self-contained search query that encapsulates the core user intent.

            Requirements:
              1. This string will be used for the Reranking step, so it must be a grammatically correct, semantically dense question or statement.
              2. Identify the main keywords.
              3. Resolve any pronouns (it, they, this) or ambiguous references based on conversation history (Contextual De-aliasing).
          `),
        queryType: z
          .enum(QUERY_TYPES)
          .default("RETRIEVAL_QUERY")
          .describe(
            "Classify the intent: use 'CODE_RETRIEVAL_QUERY' ONLY if the user explicitly asks for code snippets, implementation examples, or syntax. Use 'RETRIEVAL_QUERY' for concepts, debugging, architectural questions, or general knowledge.",
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
        }),
      ),
      execute: async ({
        multiHopQueries,
        queryRewriting,
        queryType,
      }): Promise<Array<RagChunk>> => {
        console.log("RAG tool called with multiHopQueries:", multiHopQueries);
        console.log("RAG tool called with queryRewriting:", queryRewriting);
        console.log("RAG tool called with queryType:", queryType);

        const resources = await retrieveResources({
          multiHopQueries,
          queryRewriting,
          queryType,
          previousResources: [...extractResourceIdsFromMessages(messages)],
          userId,
          projectId,
          limit: ragMaxResources,
        });

        return resources;
      },
    }),
  }) satisfies ToolSet;

export type RagTool = ReturnType<typeof ragFactory>;
