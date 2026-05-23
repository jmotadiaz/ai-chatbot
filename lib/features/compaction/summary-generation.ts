import "server-only";

import { generateText } from "ai";
import {
  SUMMARIZER_SYSTEM_PROMPT,
  INITIAL_SUMMARIZATION_PROMPT,
  INCREMENTAL_UPDATE_PROMPT,
} from "./prompts";
import { serializeMessages } from "./serialize";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";

export async function generateSummary(
  messages: ChatbotMessage[],
  previousSummary?: string,
): Promise<{ summary: string; modelUsed: string }> {
  const serializedMessages = serializeMessages(messages);
  const hasMultimedia = messages.some((msg) =>
    msg.parts?.some((part) => part.type === "file"),
  );

  const modelKey = hasMultimedia ? "Qwen 3.6 Plus" : "Deepseek v4 Flash";
  const modelConfig = languageModelConfigurations(modelKey);

  const promptText = previousSummary
    ? INCREMENTAL_UPDATE_PROMPT.replace("{previousSummary}", previousSummary)
        .replace("{serializedMessages}", serializedMessages)
    : INITIAL_SUMMARIZATION_PROMPT.replace(
        "{serializedMessages}",
        serializedMessages,
      );

  const { text: summary } = await generateText({
    ...modelConfig,
    system: SUMMARIZER_SYSTEM_PROMPT,
    prompt: promptText,
  });

  return { summary, modelUsed: modelKey };
}

export async function generateTurnPrefixSummary(
  messages: ChatbotMessage[],
): Promise<{ summary: string; modelUsed: string }> {
  const serialized = serializeMessages(messages);
  const hasMultimedia = messages.some((msg) =>
    msg.parts?.some((part) => part.type === "file"),
  );

  const modelKey = hasMultimedia ? "Qwen 3.6 Plus" : "Deepseek v4 Flash";
  const modelConfig = languageModelConfigurations(modelKey);

  const prompt = `Summarize the following turn prefix (the beginning of an assistant response that was interrupted or split):

${serialized}

Output a concise summary of what the assistant was doing, what tools it used, and what progress was made. Keep it brief.`;

  const { text: summary } = await generateText({
    ...modelConfig,
    system: SUMMARIZER_SYSTEM_PROMPT,
    prompt,
  });

  return { summary, modelUsed: modelKey };
}
