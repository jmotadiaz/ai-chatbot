import { convertToModelMessages, generateText, stepCountIs } from "ai";
import {
  chatHistoryPrompt,
  defaultMetaPrompt,
  metaPromptInputFormat,
  metaPromptOutputFormat,
  originalPrompt,
} from "./prompts";
import { RefinePromptInput } from "./types";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { ragFactory } from "@/lib/features/rag/tool";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";

import { scapeXML } from "@/lib/utils/helpers";

export async function refinePrompt({
  input,
  messages,
  metaPrompt = defaultMetaPrompt,
  projectId,
  userId,
}: RefinePromptInput) {
  const chatHistory = (await convertToModelMessages(messages || [])).reduce(
    (acc, message) => {
      const role = message.role === "user" ? "user" : "assistant";
      const content =
        typeof message.content === "string"
          ? message.content.replace(/<[^>]+>/g, "").trim()
          : "";
      return `${acc}
      <${role}>
        ${scapeXML(content)}
      </${role}>
  `;
    },
    "",
  );

  const initialPrompt = chatHistory ? chatHistoryPrompt(chatHistory) : "";

  let ragCalled = false;

  const { text } = await generateText({
    ...languageModelConfigurations("Gemini 3 Flash"),
    system: `
      ${metaPrompt}
      ${metaPromptInputFormat}
      ${metaPromptOutputFormat}
    `,
    prompt: `
      ${initialPrompt}
      ${originalPrompt(input)}
    `,
    stopWhen: stepCountIs(3),
    tools: ragFactory({
      messages: [],
      projectId,
      userId,
    }),
    activeTools: [],
    experimental_prepareStep: async () => {
      if (!ragCalled && projectId) {
        ragCalled = true;
        return {
          activeTools: [RAG_TOOL],
          toolChoice: { type: "tool", toolName: RAG_TOOL },
        };
      }
    },
  });

  return text;
}
