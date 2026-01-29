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
        Retrieves information from the knowledge base. Use for questions, code examples, or documentation clarification.

        CRITICAL: Decompose the request into distinct, fundamental core concepts. Generate parallel, self-contained search queries where each query focuses on a single concept (3 maximum). Queries MUST be in English.
      `,
      inputSchema: z.object({
        queries: z.array(z.string()).min(1).max(3).describe(`
            Identify one to three distinct core subjects or entities from the user's request.

            For each subject, generate a targeted, standalone search query following these rules:

            1. **Quantity Limit**: Generate a MAXIMUM of 3 queries. If more than 3 concepts exist, prioritize the top 3 most critical ones.
            2. **Atomic & Isolated Scope**: A query describing one core subject MUST NOT mention other core subjects. 
            3. **Descriptive**: Generate detailed, self-contained queries for each isolated subject. Fully capture the semantic depth and constraints of the user's intent, resolving all implicit references (pronouns).
            4. **Language**: Queries MUST be in English.
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
      execute: async ({ queries, queryType }): Promise<Array<RagChunk>> => {
        console.log("RAG tool called with queries:", queries);
        console.log("RAG tool called with queryType:", queryType);

        const resources = await retrieveResources({
          queries,
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
