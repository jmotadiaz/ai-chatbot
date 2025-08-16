import { tool, UIMessageStreamWriter } from "ai";
import { z } from "zod";

import { buildContextPrompt, retrieve } from "@/lib/ai/rag/retrieve";
import { ChatbotMessage } from "@/lib/ai/types";
import { RAG_TOOL } from "@/lib/ai/tools/types";

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
    execute: async ({ query }, { toolCallId }) => {
      console.log("RAG tool called with query:", query);
      writer.write({
        type: "data-rag",
        id: toolCallId,
        data: { status: "loading" },
      });
      const { resources, similarChunks } = await retrieve({
        query,
        userId,
        limit: 5,
      });
      if (!resources || !similarChunks) {
        throw new Error("No resources or similar chunks found");
      }
      writer.write({
        type: "data-rag",
        id: toolCallId,
        data: { status: "loaded" },
      });

      resources.forEach((resource, idx) => {
        writer.write({
          type: "source-url",
          sourceId: `source-rag-${toolCallId}-${idx}`,
          url: resource.url || "",
          title: resource.title,
        });
      });
      const context = buildContextPrompt(similarChunks);
      return {
        resources: resources.map(({ title }) => title),
        context,
      };
    },
  }),
});
