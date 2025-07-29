import { tool, UIMessageStreamWriter } from "ai";
import { z } from "zod";

import { buildContextPrompt, retrieve } from "@/lib/ai/rag/retrieve";
import { ChatbotMessage } from "@/lib/ai/types";

export interface RagFactoryArgs {
  writer: UIMessageStreamWriter<ChatbotMessage>;
}

export const ragFactory = ({ writer }: RagFactoryArgs) => ({
  rag: tool({
    description:
      "Get information from your knowledge base to answer questions. you will receive a json object with the resources used and the context to answer the question.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(500)
        .describe("The search query, in english."),
    }),
    execute: async ({ query }, { toolCallId }) => {
      writer.write({
        type: "data-rag",
        id: toolCallId,
        data: { status: "loading" },
      });
      const { resources, similarChunks } = await retrieve(query, 10);
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
          url: resource,
          title: resource,
        });
      });
      const context = buildContextPrompt(similarChunks);
      return {
        resources,
        context,
      };
    },
  }),
});
