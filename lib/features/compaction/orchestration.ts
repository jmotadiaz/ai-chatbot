import { pruneMessages, convertToModelMessages } from "ai";
import { estimateModelMessagesTokens } from "./token-estimation";
import { shouldCompact } from "./should-compact";
import { findCutPoint } from "./cut-point";
import { generateSummary, generateTurnPrefixSummary } from "./summary-generation";
import type { CompactionSettings, CutPointResult } from "./types";
import { DEFAULT_CONTEXT_WINDOW } from "./types";
import type { CompactionAiPort } from "./ports";
import { getLatestSummary, getMessagesByChatId, saveSummary } from "./queries";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import type { InsertChatSummary } from "@/lib/infrastructure/db/schema";
import { dbMessageToChatbotMessage } from "@/lib/features/chat/utils";
import { transaction } from "@/lib/infrastructure/db/queries";

export async function prepareCompaction(
  chatId: string,
  keepRecentTokens: number,
): Promise<{
  cutPoint: CutPointResult;
  previousSummaryText: string | null;
  tokensBefore: number;
}> {
  const dbMessages = await getMessagesByChatId(chatId);

  const messages: ChatbotMessage[] = dbMessageToChatbotMessage(dbMessages);

  const prunedMessages = pruneMessages({
    messages: await convertToModelMessages(messages),
    reasoning: "before-last-message",
    emptyMessages: "remove",
  });

  const previousSummary = await getLatestSummary(chatId);
  const tokensBefore = estimateModelMessagesTokens(prunedMessages);

  let messagesToConsider = messages;
  if (previousSummary) {
    const prevMsg = dbMessages.find((m) => m.id === previousSummary.messageId);
    if (prevMsg?.serial) {
      messagesToConsider = messages.filter(
        (_, i) => dbMessages[i]?.serial && dbMessages[i].serial! > prevMsg.serial!,
      );
    }
  }

  const cutPoint = findCutPoint(messagesToConsider, keepRecentTokens);

  return {
    cutPoint,
    previousSummaryText: previousSummary?.summary ?? null,
    tokensBefore,
  };
}

export async function compact(
  ai: CompactionAiPort,
  chatId: string,
  settings: CompactionSettings,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  if (!settings.enabled) return;

  const { cutPoint, previousSummaryText, tokensBefore } =
    await prepareCompaction(chatId, settings.keepRecentTokens);

  if (cutPoint.messagesToSummarize.length === 0) return;
  if (signal?.aborted) return;

  const contextWindow = settings.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  if (!shouldCompact(tokensBefore, contextWindow, settings)) return;

  const lastSummarizedMessage = cutPoint.messagesToSummarize.at(-1);

  const isSplitTurn =
    lastSummarizedMessage?.role === "assistant" &&
    lastSummarizedMessage.parts?.some(
      (p) => p.type === "tool-rag" || p.type === "tool-webSearch" ||
        p.type === "tool-urlContext" || p.type === "tool-queryDocs" ||
        p.type === "tool-resolveLibraryId",
    ) &&
    lastSummarizedMessage.parts?.some((p) => p.type === "text" && p.text.length > 0);

  let summary: string;
  let modelUsed: string;

  if (isSplitTurn) {
    const result = await generateTurnPrefixSummary(ai, cutPoint.messagesToSummarize);
    summary = result.summary;
    modelUsed = result.modelUsed;
  } else {
    const result = await generateSummary(
      ai,
      cutPoint.messagesToSummarize,
      previousSummaryText ?? undefined,
    );
    summary = result.summary;
    modelUsed = result.modelUsed;
  }

  if (signal?.aborted) return;

  const insertData: InsertChatSummary = {
    chatId,
    messageId: lastSummarizedMessage?.id ?? "",
    summary,
    tokensBefore,
    modelUsed,
  };

  await transaction(saveSummary(insertData));
}
