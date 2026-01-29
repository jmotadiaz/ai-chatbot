import { tool, ToolSet, UIMessage } from "ai";
import { z } from "zod";
import { RagChunk } from "./types";
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
      `,
      inputSchema: z.object({
        queries: z.array(z.string()).min(1).max(3).describe(`
            Identify one to three distinct core subjects or entities from the user's request.

            For each subject, generate a targeted, standalone search query following these rules:

            1. **Atomic & Isolated Scope**: A query describing one core subject MUST NOT mention the other core subjects.
            2. **Descriptive**: Generate detailed, self-contained queries for each isolated subject, fully capturing the semantic depth and constraints of the user's intent and resolving all implicit references (pronouns).
            3. **Language**: Queries MUST be in English.
        `),
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
      execute: async ({ queries }): Promise<Array<RagChunk>> => {
        console.log("RAG tool called with queries:", queries);

        const resources = await retrieveResources({
          queries,
          queryType: "RETRIEVAL_QUERY",
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
