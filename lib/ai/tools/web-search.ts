import type { UIMessageStreamWriter} from "ai";
import { tool, generateObject } from "ai";
import { z } from "zod";
// eslint-disable-next-line import-x/no-named-as-default
import Exa from "exa-js";
import type { ChatbotMessage } from "@/lib/ai/types";
import { languageModelConfigurations } from "@/lib/ai/models/definition";
import { URL_CONTEXT_TOOL, WEB_SEARCH_TOOL } from "@/lib/ai/tools/types";

const exa = new Exa(process.env.EXA_API_KEY);

export interface WebSearchFactoryArgs {
  writer: UIMessageStreamWriter<ChatbotMessage>;
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

export const webSearchFactory = ({ writer }: WebSearchFactoryArgs) => ({
  [WEB_SEARCH_TOOL]: tool({
    description: `
    Search the web for up-to-date information
    - Input: An object with a single string property 'query'.
    - Output: An array of objects, where each object represents a search result and contains 'title' (string), 'url' (string), 'content' (string), and an optional 'publishedDate' (string).
    `,
    inputSchema: webSearchInputSchema,
    outputSchema,
    execute: async ({ query }, { toolCallId }) => {
      console.log("Web Search tool called with query:", query);
      writer.write({
        type: "data-web-search",
        id: toolCallId,
        data: { status: "loading" },
      });

      const { results } = await exa.searchAndContents(query, {
        livecrawl: "preferred",
        numResults: 3,
      });

      console.log("Web Search results:", results.length);

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

export const hasContextUrls = async (text: string): Promise<boolean> => {
  const { object } = await generateObject({
    ...languageModelConfigurations("Gemini 2.5 Flash Lite"),
    system: `
    You are acting as a highly accurate intent classification engine. Your sole task is to analyze the user's prompt and determine the primary purpose of the URLs it contains.
    You must classify the intent into one of the following three categories:

    1.  **\`CONTEXT_EXTRACTION\`**: Select this option if the user's goal is to use the content of the URL as a source of information or context to complete a task. The primary action involves reading and understanding the content at the web address.
        -   *Example 1*: "Summarize the following article: https://example.com/news/story"
        -   *Example 2*: "Based on the documentation on this page https://react.dev/reference/react/memo, write a React component."
        -   *Example 3*: "What are the key points of https://research.google/blog/?"

    2.  **\`URL_MANIPULATION\`**: Select this option if the user's goal is to perform an operation directly on the URL string. The task does not involve accessing the content of the page, but rather transforming the URL string itself.
        -   *Example 1*: "Change the protocol of http://insecure-site.com to https."
        -   *Example 2*: "Extract the domain name from the following address: https://www.some-long-url.co.uk/path/to/page"
        -   *Example 3*: "Please shorten this URL: https://example.com/product/12345?variant=67890"

    3.  **\`OTHER\`**: Select this option if the intent does not clearly fit into the other categories, is ambiguous, or if the URL is simply presented as an example without a specific action tied to it.
        -   *Example 1*: "Here is a URL: https://example.com"
        -   *Example 2*: "My website is https://my-portfolio.dev"
    `,
    prompt: text,
    schema: z.object({
      intent: z
        .enum(["CONTEXT_EXTRACTION", "URL_MANIPULATION", "OTHER"])
        .describe(
          "True if the text contains URLs for web search, false otherwise"
        ),
    }),
  });

  return object.intent === "CONTEXT_EXTRACTION";
};
