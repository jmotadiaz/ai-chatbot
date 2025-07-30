import { tool, UIMessageStreamWriter } from "ai";
import { z } from "zod";
// eslint-disable-next-line import-x/no-named-as-default
import Exa from "exa-js";
import { ChatbotMessage } from "@/lib/ai/types";

const exa = new Exa(process.env.EXA_API_KEY);

export interface WebSearchFactoryArgs {
  writer: UIMessageStreamWriter<ChatbotMessage>;
}

const webSearchInputSchema = z.object({
  query: z.string().min(1).max(100).describe("Optimized query for web search"),
});

const urlContextInputSchema = z.object({
  urls: z
    .array(z.string())
    .describe("The urls provided directly in the user prompt"),
});

const outputSchema = z.array(
  z.object({
    title: z.string().describe("The title of the search result"),
    url: z.string().url().describe("The URL of the search result"),
    content: z
      .string()
      .describe("A snippet of the content from the search result"),
    publishedDate: z
      .string()
      .optional()
      .describe("The date the content was published"),
  })
);

export const webSearchFactory = ({ writer }: WebSearchFactoryArgs) => ({
  webSearch: tool({
    description: "Search the web for up-to-date information",
    inputSchema: webSearchInputSchema,
    outputSchema,
    execute: async ({ query }, { toolCallId }) => {
      writer.write({
        type: "data-web-search",
        id: toolCallId,
        data: { status: "loading" },
      });

      const { results } = await exa.searchAndContents(query, {
        livecrawl: "always",
        numResults: 5,
      });

      writer.write({
        type: "data-web-search",
        id: toolCallId,
        data: { status: "loaded" },
      });

      return results.map((result) => {
        writer.write({
          type: "source-url",
          sourceId: `source-web-search-${result.id}`,
          url: result.url,
          title: result.title || "",
        });

        return {
          title: result.title?.trim() || result.url,
          url: result.url,
          content: result.text,
        };
      });
    },
  }),
});

export const urlContextFactory = ({ writer }: WebSearchFactoryArgs) => ({
  urlContext: tool({
    description:
      "Search the web using the **exact URLs** the user explicitly lists in their prompt. These URLs are required as **context for answering the question**",
    inputSchema: urlContextInputSchema,
    outputSchema,
    execute: async ({ urls }, { toolCallId }) => {
      writer.write({
        type: "data-web-search",
        id: toolCallId,
        data: { status: "loading" },
      });

      const { results } = await exa.getContents(urls, {
        livecrawl: "always",
        text: true,
      });

      writer.write({
        type: "data-web-search",
        id: toolCallId,
        data: { status: "loaded" },
      });

      return results.map((result) => {
        writer.write({
          type: "source-url",
          sourceId: `source-url-context-${result.id}`,
          url: result.url,
          title: result.title || "",
        });

        return {
          title: result.title?.trim() || result.url,
          url: result.url,
          content: result.text,
        };
      });
    },
  }),
});
