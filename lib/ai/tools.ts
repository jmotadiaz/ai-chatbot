import { tool } from "ai";
import { z } from "zod";

export const weatherTool = tool({
  description: "Get the weather in a location",
  parameters: z.object({
    location: z.string().describe("The location to get the weather for"),
  }),
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});

export const codeSnippet = tool({
  description:
    "Write code snippets when user asks for code. for example, 'Write a Javascript function to add two numbers.' or 'The output format should be markdown.'",
  parameters: z.object({
    language: z.string().describe("The language of the code snippet"),
    code: z.string().describe("The code snippet to be executed"),
  }),
  execute: async function ({ language, code }) {
    console.log("Executing code tool with language:", language);
    console.log("Code snippet:", code);
    return {
      language,
      code: language === "markdown" ? code.replaceAll("`", "\\`") : code,
    };
  },
});
