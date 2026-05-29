import { estimateContextTokens, pruneChatMessages } from "./token-estimation";
import { shouldCompact } from "./should-compact";
import { findCutPoint } from "./cut-point";
import { generateSummary, generateTurnPrefixSummary } from "./summary-generation";
import type { CompactionSettings, CutPointResult } from "./types";
import { DEFAULT_CONTEXT_WINDOW } from "./types";
import type { CompactionDbPort, CompactionAiPort } from "./ports";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import type { InsertChatSummary } from "@/lib/infrastructure/db/schema";
import { dbMessageToChatbotMessage } from "@/lib/features/chat/utils";

export async function prepareCompaction(
  db: CompactionDbPort,
  chatId: string,
  keepRecentTokens: number,
): Promise<{
  cutPoint: CutPointResult;
  previousSummaryText: string | null;
  tokensBefore: number;
}> {
  const dbMessages = await db.getMessagesByChatId(chatId);

  const messages: ChatbotMessage[] = dbMessageToChatbotMessage(dbMessages);
  const prunedMessages = pruneChatMessages(messages);

  const previousSummary = await db.getLatestSummary(chatId);
  const tokensBefore = estimateContextTokens(prunedMessages);

  let messagesToConsider = messages;
  if (previousSummary) {
    const prevMsg = dbMessages.find((m) => m.id === previousSummary.messageId);
    if (prevMsg?.serial) {
      messagesToConsider = messages.filter(
        (_, i) => dbMessages[i]?.serial && dbMessages[i].serial! > prevMsg.serial!,
      );
    }
  }

  const prunedMessagesToConsider = pruneChatMessages(messagesToConsider);
  const cutPoint = findCutPoint(prunedMessagesToConsider, keepRecentTokens);

  return {
    cutPoint,
    previousSummaryText: previousSummary?.summary ?? null,
    tokensBefore,
  };
}

export async function compact(
  db: CompactionDbPort,
  ai: CompactionAiPort,
  chatId: string,
  settings: CompactionSettings,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  if (!settings.enabled) return;

  const { cutPoint, previousSummaryText, tokensBefore } =
    await prepareCompaction(db, chatId, settings.keepRecentTokens);

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

  await db.transaction(db.saveSummary(insertData));
}
