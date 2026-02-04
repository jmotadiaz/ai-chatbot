import { tool, ToolSet, UIMessage } from "ai";
import { z } from "zod";
import { RagChunk } from "./types";
import { retrieveResourceChunks } from "./retrieve/search";
import { extractChunkIdsFromMessages } from "./extract-resource-ids";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import {
  multiHopQueryPrompt,
  queryRewritePrompt,
  toolDescriptionPrompt,
} from "@/lib/features/rag/prompts";
import { logOnFile } from "@/lib/utils/server-utils";

export interface RagFactoryArgs {
  messages: UIMessage[];
  userId: string;
  projectId?: string;
}

export const ragFactory = ({ userId, projectId, messages }: RagFactoryArgs) =>
  ({
    [RAG_TOOL]: tool({
      description: toolDescriptionPrompt,
      inputSchema: z.object({
        multiHopQueries: z
          .array(z.string())
          .min(1)
          .max(5)
          .describe(multiHopQueryPrompt),
        queryRewriting: z.string().describe(queryRewritePrompt),
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
      }): Promise<Array<RagChunk>> => {
        console.log("RAG tool called with multiHopQueries:", multiHopQueries);
        console.log("RAG tool called with queryRewriting:", queryRewriting);

        const chunks = await retrieveResourceChunks({
          multiHopQueries,
          queryRewriting,
          previousResources: [...extractChunkIdsFromMessages(messages)],
          userId,
          projectId,
        });

        logOnFile("rag-results.json", chunks);

        return chunks;
      },
    }),
  }) satisfies ToolSet;

export type RagTool = ReturnType<typeof ragFactory>;
