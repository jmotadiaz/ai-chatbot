import { tool } from "ai";
import { z } from "zod";
// eslint-disable-next-line import-x/no-named-as-default
import Exa from "exa-js";

const exa = new Exa(process.env.EXA_API_KEY);

export const webSearch = tool({
  description: "Search the web for up-to-date information",
  parameters: z.object({
    query: z.string().min(1).max(100).describe("The search query"),
  }),
  execute: async ({ query }) => {
    try {
      const { results } = await exa.searchAndContents(query, {
        livecrawl: "always",
        numResults: 5,
      });
      return results.map((result) => ({
        title: result.title,
        url: result.url,
        content: result.text.slice(0, 1000), // take just the first 1000 characters
        publishedDate: result.publishedDate,
      }));
    } catch (error) {
      console.error("Error in webSearch tool:", error);
      return [];
    }
  },
});

export type WebSearchResults = Awaited<
  ReturnType<Exclude<(typeof webSearch)["execute"], undefined>>
>;
