import "server-only";

import { LANGUAGE_MODEL_ROLES, type LanguageModelRole } from "models";
import {
  SUMMARIZER_SYSTEM_PROMPT,
  INITIAL_SUMMARIZATION_PROMPT,
  INCREMENTAL_UPDATE_PROMPT,
} from "./prompts";
import { serializeMessages } from "./serialize";
import type { CompactionAiPort } from "./ports";
import type { ChatbotMessage } from "@/lib/features/chat/types";

/**
 * The two roles this feature's runtime `hasMultimedia` ternary picks
 * between — see LANGUAGE_MODEL_ROLES in `models`. Narrowing to just these
 * two (instead of the full LanguageModelRole union) is what lets
 * `LANGUAGE_MODEL_ROLES[modelKey]` below resolve to a literal ModelId.
 */
type CompactionModelRole = Extract<
  LanguageModelRole,
  "compactionText" | "compactionMultimedia"
>;

export async function generateSummary(
  ai: CompactionAiPort,
  messages: ChatbotMessage[],
  previousSummary?: string,
): Promise<{ summary: string; modelUsed: string }> {
  const serializedMessages = serializeMessages(messages);
  const hasMultimedia = messages.some((msg) =>
    msg.parts?.some((part) => part.type === "file"),
  );

  const modelKey: CompactionModelRole = hasMultimedia
    ? "compactionMultimedia"
    : "compactionText";

  const promptText = previousSummary
    ? INCREMENTAL_UPDATE_PROMPT.replace("{previousSummary}", previousSummary)
        .replace("{serializedMessages}", serializedMessages)
    : INITIAL_SUMMARIZATION_PROMPT.replace(
        "{serializedMessages}",
        serializedMessages,
      );

  // The port still resolves by role; only the persisted provenance
  // (modelUsed, a DB column — see ChatSummary in db/schema.ts) needs the
  // catalog id a role currently points at, not the role name itself.
  const summary = await ai.generateText(
    modelKey,
    SUMMARIZER_SYSTEM_PROMPT,
    promptText,
  );

  return { summary, modelUsed: LANGUAGE_MODEL_ROLES[modelKey] };
}

export async function generateTurnPrefixSummary(
  ai: CompactionAiPort,
  messages: ChatbotMessage[],
): Promise<{ summary: string; modelUsed: string }> {
  const serialized = serializeMessages(messages);
  const hasMultimedia = messages.some((msg) =>
    msg.parts?.some((part) => part.type === "file"),
  );

  const modelKey: CompactionModelRole = hasMultimedia
    ? "compactionMultimedia"
    : "compactionText";

  const prompt = `Summarize the following turn prefix (the beginning of an assistant response that was interrupted or split):

${serialized}

Output a concise summary of what the assistant was doing, what tools it used, and what progress was made. Keep it brief.`;

  const summary = await ai.generateText(
    modelKey,
    SUMMARIZER_SYSTEM_PROMPT,
    prompt,
  );

  return { summary, modelUsed: LANGUAGE_MODEL_ROLES[modelKey] };
}
