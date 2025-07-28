import { tool, UIMessageStreamWriter } from "ai";
import { z } from "zod";
// eslint-disable-next-line import-x/no-named-as-default
import Exa from "exa-js";
import { ChatbotMessage } from "@/lib/ai/types";

const exa = new Exa(process.env.EXA_API_KEY);

export interface WebSearchFactoryArgs {
  writer: UIMessageStreamWriter<ChatbotMessage>;
}

export const webSearch = ({ writer }: WebSearchFactoryArgs) =>
  tool<
    { query: string },
    Array<{
      title: string;
      url: string;
      content: string;
      publishedDate?: string;
    }>
  >({
    description: "Search the web for up-to-date information",
    inputSchema: z.object({
      query: z.string().min(1).max(100).describe("The search query"),
    }),
    outputSchema: z.array(
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
    ),
    execute: async ({ query }, { toolCallId }) => {
      writer.write({
        type: "data-web-search", // Custom type
        id: toolCallId, // ID for updates
        data: { status: "loading" }, // Your data
      });

      const { results } = await exa.searchAndContents(query, {
        livecrawl: "always",
        numResults: 5,
      });

      writer.write({
        type: "data-web-search", // Custom type
        id: toolCallId, // ID for updates
        data: { status: "loaded" }, // Your data
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
          content: result.text.slice(0, 1000), // take just the first 1000 characters
          publishedDate: result.publishedDate,
        };
      });
    },
  });
