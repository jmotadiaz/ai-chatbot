import type { UIMessageStreamWriter } from "ai";
import { tool } from "ai";
import { z } from "zod";
// eslint-disable-next-line import-x/no-named-as-default
import Exa from "exa-js";
import { URL_CONTEXT_TOOL, WEB_SEARCH_TOOL } from "./constants";
import { defaultWebSearchNumResults } from "@/lib/features/models/constants";
import type { ChatbotMessage } from "@/lib/types";

// Lazy access to Exa client; supports both legacy EXA_API_KEY and new EXASEARCH_API_KEY
const getExaClient = () => {
  const key = process.env.EXASEARCH_API_KEY || process.env.EXA_API_KEY;
  if (!key) return null;
  try {
    return new Exa(key);
  } catch (e) {
    console.warn("Failed to initialize Exa client", e);
    return null;
  }
};

export interface WebSearchFactoryArgs {
  writer: UIMessageStreamWriter<ChatbotMessage>;
  webSearchNumResults?: number;
}

const webSearchInputSchema = z.object({
  query: z.string().min(1).max(300).describe("Optimized query for web search"),
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

export const webSearchFactory = ({
  writer,
  webSearchNumResults = defaultWebSearchNumResults,
}: WebSearchFactoryArgs) => ({
  [WEB_SEARCH_TOOL]: tool({
    description: `
    Search the web for up-to-date information
    - Input: An object with a single string property 'query'.
    - Output: An array of objects, where each object represents a search result and contains 'title' (string), 'url' (string), 'content' (string), and an optional 'publishedDate' (string).
    `,
    inputSchema: webSearchInputSchema,
    outputSchema,
    execute: async ({ query }) => {
      console.log("Web Search tool called with query:", query);

      const exa = getExaClient();
      if (!exa) {
        console.warn(
          "Web Search skipped: EXASEARCH_API_KEY (or EXA_API_KEY) missing. Returning empty results."
        );
        return [];
      }

      const clampedResults = Math.min(Math.max(webSearchNumResults, 1), 10);
      const { results } = await exa.searchAndContents(query, {
        livecrawl: "preferred",
        numResults: clampedResults,
      });

      console.log("Web Search results:", results.length);
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
          content: result.text.slice(0, 1000),
        };
      });
    },
  }),
});

export const urlContextFactory = ({ writer }: WebSearchFactoryArgs) => ({
  [URL_CONTEXT_TOOL]: tool({
    description: `
    Retrieves the textual content from a list of specific URLs provided by the user.
    - Input: An object with a single property 'urls', which is an array of strings representing the URLs.
    - Output: An array of objects, where each object contains 'title' (string),
    `,
    inputSchema: urlContextInputSchema,
    outputSchema: outputSchema,
    execute: async ({ urls }) => {
      const exa = getExaClient();
      if (!exa) {
        console.warn(
          "URL Context skipped: EXASEARCH_API_KEY (or EXA_API_KEY) missing. Returning empty results."
        );
        return [];
      }

      const { results } = await exa.getContents(urls, {
        livecrawl: "always",
        text: true,
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

export type WebSearchTool = ReturnType<typeof webSearchFactory>;
export type URLContextTool = ReturnType<typeof urlContextFactory>;
