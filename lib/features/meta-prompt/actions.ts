import { convertToModelMessages, generateText, stepCountIs } from "ai";
import {
  chatHistoryPrompt,
  continuationMetaPrompt,
  initialMetaPrompt,
  metaPromptInputFormat,
  metaPromptOutputFormat,
  originalPrompt,
  systemMetaPrompt,
} from "./prompts";
import { RefinePromptInput } from "./types";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { ragFactory } from "@/lib/features/rag/tool";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";

import { scapeXML } from "@/lib/utils/helpers";

export async function refinePrompt({
  input,
  messages,
  projectId,
  userId,
  mode = "chat",
}: RefinePromptInput) {
  if (mode === "project") {
    return refineSystemPrompt({ input, projectId, userId });
  }

  return refineChatPrompt({ input, messages });
}

async function refineChatPrompt({
  input,
  messages,
}: Pick<RefinePromptInput, "input" | "messages">) {
  const modelMessages = await convertToModelMessages(messages || []);
  const chatHistory = formatChatHistory(modelMessages);

  // If we have history, use continuation prompt. Otherwise use initial prompt.
  const isContinuation = modelMessages.length > 0;

  const metaPrompt = isContinuation
    ? continuationMetaPrompt
    : initialMetaPrompt;

  const initialPrompt = isContinuation ? chatHistoryPrompt(chatHistory) : "";

  const { text } = await generateText({
    ...languageModelConfigurations("GPT OSS"),
    system: `
      ${metaPrompt}
      ${metaPromptInputFormat}
      ${metaPromptOutputFormat}
    `,
    prompt: `
      ${initialPrompt}
      ${originalPrompt(input)}
    `,
  });

  return text;
}

async function refineSystemPrompt({
  input,
  projectId,
  userId,
}: Pick<RefinePromptInput, "input" | "projectId" | "userId">) {
  const metaPrompt = systemMetaPrompt;

  let ragCalled = false;

  const { text } = await generateText({
    ...languageModelConfigurations("Gemini 3 Flash"),
    system: `
      ${metaPrompt}
      ${metaPromptInputFormat}
      ${metaPromptOutputFormat}
    `,
    prompt: `
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

function formatChatHistory(
  messages: { role: string; content: unknown }[],
): string {
  return messages.reduce((acc, message) => {
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
  }, "");
}
