import { convertToModelMessages, generateText, stepCountIs } from "ai";
import {
  chatHistoryPrompt,
  defaultMetaPrompt,
  metaPromptInputFormat,
  metaPromptOutputFormat,
  originalPrompt,
  systemMetaPrompt,
} from "./prompts";
import { RefinePromptInput, RefinePromptMode } from "./types";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { ragFactory } from "@/lib/features/rag/tool";
import {
  languageModelConfigurations,
  LanguageModelKeys,
} from "@/lib/features/foundation-model/config";

import { scapeXML } from "@/lib/utils/helpers";

const modeConfig: Record<
  RefinePromptMode,
  { prompt: string; model: LanguageModelKeys }
> = {
  chat: { prompt: defaultMetaPrompt, model: "GPT OSS" },
  project: { prompt: systemMetaPrompt, model: "Gemini 3 Flash" },
};

export async function refinePrompt({
  input,
  messages,
  mode = "chat",
  projectId,
  userId,
}: RefinePromptInput) {
  const { prompt: metaPrompt, model } = modeConfig[mode];

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
    ...languageModelConfigurations(model),
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
