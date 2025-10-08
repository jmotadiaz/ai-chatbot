import type { UIMessageStreamWriter } from "ai";
import { tool } from "ai";
import { z } from "zod";

import { retrieve } from "@/lib/ai/rag/retrieve";
import type { ChatbotMessage } from "@/lib/ai/types";
import { RAG_TOOL } from "@/lib/ai/tools/types";
import type { SimilarChunks } from "@/lib/db/queries";

export interface RagFactoryArgs {
  writer: UIMessageStreamWriter<ChatbotMessage>;
  userId: string;
}

export const ragFactory = ({ writer, userId }: RagFactoryArgs) => ({
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
    }),
    outputSchema: z.array(
      z.object({
        content: z.string().describe("The content of the chunk."),
        resourceTitle: z.string().describe("The title of the resource."),
        resourceUrl: z.string().nullable().describe("The URL of the resource."),
        similarity: z.number().describe("The similarity score of the chunk."),
      })
    ),
    execute: async ({ query }, { toolCallId }): Promise<SimilarChunks> => {
      console.log("RAG tool called with query:", query);
      writer.write({
        type: "data-rag",
        id: toolCallId,
        data: { status: "loading" },
      });

      const { resources, similarChunks } = await retrieve({
        query,
        userId,
        limit: 10,
      });

      writer.write({
        type: "data-rag",
        id: toolCallId,
        data: { status: "loaded" },
      });

      if (!resources || !similarChunks) {
        console.error("No resources or similar chunks found");
        return [];
      }

      resources.forEach((resource, idx) => {
        writer.write({
          sourceId: `source-rag-${toolCallId}-${idx}`,
          title: resource.title,
          ...(resource.url
            ? { type: "source-url", url: resource.url }
            : { type: "source-document", mediaType: "text/plain" }),
        });
      });

      return similarChunks;
    },
  }),
});
