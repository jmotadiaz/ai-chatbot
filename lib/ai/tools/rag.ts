import { tool } from "ai";
import { z } from "zod";

import { buildContextPrompt, retrieve } from "@/lib/ai/rag/retrieve";

export const rag = tool({
  description:
    "Get information from your knowledge base to answer questions. you will receive a json object with the resources used and the context to answer the question.",
  parameters: z.object({
    query: z.string().min(1).max(500).describe("The search query, in english"),
  }),
  execute: async ({ query }) => {
    const { resources, similarChunks } = await retrieve(query, 10);
    if (!resources || !similarChunks) {
      throw new Error("No resources or similar chunks found");
    }
    const context = buildContextPrompt(similarChunks);
    return {
      resources,
      context,
    };
  },
});

export type RagResults = Awaited<
  ReturnType<Exclude<(typeof rag)["execute"], undefined>>
>;
