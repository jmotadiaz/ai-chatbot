import { tool, UIMessageStreamWriter } from "ai";
import { z } from "zod";
// eslint-disable-next-line import-x/no-named-as-default
import Exa from "exa-js";
import { ChatbotMessage } from "@/lib/ai/types";

const exa = new Exa(process.env.EXA_API_KEY);

export interface WebSearchFactoryArgs {
  writer: UIMessageStreamWriter<ChatbotMessage>;
}

const inputSchema = z.object({
  query: z.string().min(1).max(100).describe("The search query"),
  urls: z.array(z.string()).describe("The urls provided by the user"),
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
    inputSchema,
    outputSchema,
    execute: async ({ query, urls }, { toolCallId }) => {
      writer.write({
        type: "data-web-search",
        id: toolCallId,
        data: { status: "loading" },
      });

      const { results } =
        urls.length > 0
          ? await exa.getContents(urls, { livecrawl: "always" })
          : await exa.searchAndContents(query, {
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
          sourceId: `source-${result.id}`,
          url: result.url,
          title: result.title || "",
        });

        return {
          title: result.title || "",
          url: result.url,
          content: result.text.slice(0, 1000),
          publishedDate: result.publishedDate,
        };
      });
    },
  }),
});
