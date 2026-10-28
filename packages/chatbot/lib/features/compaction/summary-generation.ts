import "server-only";

import { generateText } from "ai";
import {
  SUMMARIZER_SYSTEM_PROMPT,
  INITIAL_SUMMARIZATION_PROMPT,
  INCREMENTAL_UPDATE_PROMPT,
} from "./prompts";
import { serializeMessages } from "./serialize";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import type { ChatbotMessage } from "@/lib/features/chat/types";

/**
 * The two Default Model Contracts this feature's runtime `hasMultimedia`
 * ternary picks between (spec §2.4): text-only turns compact with
 * `reasoning-default`, turns with multimedia (files) with `vision-default`.
 */
const COMPACTION_TEXT_CONTRACT = "reasoning-default";
const COMPACTION_MULTIMEDIA_CONTRACT = "vision-default";

/**
 * Summarization is a non-streaming, low-temperature call resolved through the
 * shared inference infrastructure (ADR 0013): the feature owns the contract, the
 * prompts and the parameters; the kit owns the transport, configuration and
 * tracing. Tests substitute the Gateway at its HTTP seam, not this call.
 */
const generateModelText = async (
  modelKey: string,
  system: string,
  prompt: string,
): Promise<string> => {
  const { text } = await generateText({
    ...inferenceKit.languageModel(modelKey),
    system,
    prompt,
    temperature: 0.1,
  });
  return text;
};

export async function generateSummary(
  messages: ChatbotMessage[],
  previousSummary?: string,
): Promise<{ summary: string; modelUsed: string }> {
  const serializedMessages = serializeMessages(messages);
  const hasMultimedia = messages.some((msg) =>
    msg.parts?.some((part) => part.type === "file"),
  );

  const modelKey = hasMultimedia
    ? COMPACTION_MULTIMEDIA_CONTRACT
    : COMPACTION_TEXT_CONTRACT;

  const promptText = previousSummary
    ? INCREMENTAL_UPDATE_PROMPT.replace("{previousSummary}", previousSummary)
        .replace("{serializedMessages}", serializedMessages)
    : INITIAL_SUMMARIZATION_PROMPT.replace(
        "{serializedMessages}",
        serializedMessages,
      );

  const summary = await generateModelText(
    modelKey,
    SUMMARIZER_SYSTEM_PROMPT,
    promptText,
  );

  // Provenance persisted in ChatSummary.modelUsed (a DB column): the
  // contract name itself is the stable identifier now.
  return { summary, modelUsed: modelKey };
}

export async function generateTurnPrefixSummary(
  messages: ChatbotMessage[],
): Promise<{ summary: string; modelUsed: string }> {
  const serialized = serializeMessages(messages);
  const hasMultimedia = messages.some((msg) =>
    msg.parts?.some((part) => part.type === "file"),
  );

  const modelKey = hasMultimedia
    ? COMPACTION_MULTIMEDIA_CONTRACT
    : COMPACTION_TEXT_CONTRACT;

  const prompt = `Summarize the following turn prefix (the beginning of an assistant response that was interrupted or split):

${serialized}

Output a concise summary of what the assistant was doing, what tools it used, and what progress was made. Keep it brief.`;

  const summary = await generateModelText(
    modelKey,
    SUMMARIZER_SYSTEM_PROMPT,
    prompt,
  );

  return { summary, modelUsed: modelKey };
}
