import { generateObject } from "ai";
import { z } from "zod";
import { languageModelConfigurations } from "@/lib/features/foundation-model/helpers";

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
