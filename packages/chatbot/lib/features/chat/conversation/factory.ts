import { randomUUID } from "node:crypto";
import {
  createUIMessageStream,
  smoothStream,
  convertToModelMessages,
  pruneMessages,
  NoSuchToolError,
  InvalidArgumentError,
} from "ai";
import type { ModelMessage } from "ai";
import { config } from "config";
import { getModelCatalogSnapshot, warmModelCatalog } from "@/lib/infrastructure/ai/catalog";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import { ChatAgentAiPort } from "@/lib/features/chat/conversation/ports";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import type { ChatbotMessage, ChatMode } from "@/lib/features/chat/types";
import {
  buildChatModeRouterInput,
  resolveChatMode,
} from "@/lib/features/chat/mode-routing";
import type {
  ChatModeRouterPort,
  ChatModeRoutingMetadata,
} from "@/lib/features/chat/mode-routing";
import {
  defaultWebSearchNumResults,
  getChatConfigurationByModelId,
} from "@/lib/features/foundation-model/config";
import { chatbotMessageToDbMessage } from "@/lib/features/chat/utils";
import { generateTitle } from "@/lib/features/chat/title";
import { createChatModeAgent } from "@/lib/features/chat/chat-modes/factory";
import { extractMemoryFacts } from "@/lib/features/memory/extraction";
import { compact } from "@/lib/features/compaction/orchestration";
import { rebuildContext } from "@/lib/features/compaction/context-rebuild";
import {
  getEffectiveKeepRecentTokens,
  getEffectiveReserveTokens,
} from "@/lib/features/compaction/types";
import type { CompactionAiPort } from "@/lib/features/compaction/ports";
import {
  saveChat,
  updateChat,
  saveMessages,
  deleteMessageById,
  getChatById,
} from "@/lib/features/chat/queries";
import {
  markPersisted,
  setChatId,
} from "@/lib/features/chat/resume/registry";
import { transaction } from "@/lib/infrastructure/db/queries";

/**
 * Deduplicates tool parts that share a toolCallId. A poisoned history with two
 * error parts for the same call makes every provider reject the request
 * ("Duplicate function_call_output" on /responses, 400 on /chat/completions)
 * regardless of the selected model.
 */
export const dedupeToolParts = (
  parts: ChatbotMessage["parts"],
): ChatbotMessage["parts"] => {
  const seenToolCallIds = new Set<string>();
  return parts.filter((part) => {
    if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
      const toolCallId = (part as { toolCallId?: string }).toolCallId;
      if (!toolCallId) return true;
      if (seenToolCallIds.has(toolCallId)) return false;
      seenToolCallIds.add(toolCallId);
    }
    return true;
  });
};

const processMessagesToSend = async ({
  messages,
}: {
  messages: ChatbotMessage[];
}): Promise<ModelMessage[]> => {
  return convertToModelMessages(
    messages.map((msg) => {
      const dedupedParts = dedupeToolParts(msg.parts);
      if (msg.role === "user" && msg.metadata?.textFiles?.length) {
        const textFileContents = msg.metadata.textFiles
          .map(
            (f) => `\n\n---\nAttached File: ${f.filename}\n${f.content}\n---`,
          )
          .join("");

        return {
          ...msg,
          parts: dedupedParts.map((part) =>
            part.type === "text"
              ? { ...part, text: part.text + textFileContents }
              : part,
          ),
        };
      }
      return { ...msg, parts: dedupedParts };
    }),
  );
};

/**
 * Only the temperature/topP/topK keys the caller actually set, so folding
 * them into a Model Configuration or into `createAgent`'s overrides never
 * clobbers the resolved model's own default with `undefined` (mirrors the
 * `overrides.temperature ?? base.temperature` fallback this replaces).
 */
const definedOverrides = (overrides: {
  temperature?: number;
  topP?: number;
  topK?: number;
}) => ({
  ...(overrides.temperature !== undefined && {
    temperature: overrides.temperature,
  }),
  ...(overrides.topP !== undefined && { topP: overrides.topP }),
  ...(overrides.topK !== undefined && { topK: overrides.topK }),
});

/**
 * Builds a ChatAgentAiPort where every Chat Mode builds its agent from the
 * same user-selected model plus the chat-level overrides, through the kit's
 * `createAgent`/`createAgentModel` — tracing included: no chatbot code wraps
 * the model with tracing itself anymore, that is entirely the kit's job.
 */
const buildAgentAdapter = (
  selectedModel: chatModelId,
  overrides: { temperature?: number; topP?: number; topK?: number },
): ChatAgentAiPort => {
  const chatOverrides = definedOverrides(overrides);

  return {
    getModelConfiguration: () => ({
      ...inferenceKit.createAgentModel(selectedModel),
      ...chatOverrides,
    }),
    createAgent: (options) =>
      inferenceKit.createAgent(selectedModel, {
        ...options,
        overrides: { ...chatOverrides, ...options.overrides },
      }),
  };
};

export const makeProcessChatResponse = (
  compactionAi: CompactionAiPort,
  modeRouter: ChatModeRouterPort,
) => {
  return async ({
    messages,
    selectedModel,
    temperature,
    topP,
    topK,
    chatId,
    systemPrompt,
    messageId,
    projectId,
    preventChatPersistence = false,
    chatMode = "auto",
    streamKey,
    webSearchNumResults = defaultWebSearchNumResults,
    ragMaxResources,
    minRagResourcesScore,
    user,
  }: {
    messages: ChatbotMessage[];
    selectedModel: chatModelId;
    temperature?: number;
    topP?: number;
    topK?: number;
    chatId?: string;
    systemPrompt?: string;
    messageId?: string;
    projectId?: string;
    preventChatPersistence?: boolean;
    chatMode?: ChatMode;
    streamKey?: string;
    webSearchNumResults?: number;
    ragMaxResources?: number;
    minRagResourcesScore?: number;
    user: { id: string };
  }) => {
    // Return early if no user
    if (!user?.id) {
      throw new Error("Unauthorized");
    }

    // Warm the catalog snapshot before the (synchronous) languageModel/
    // createAgentModel resolutions in buildAgentAdapter and every Chat Mode.
    await warmModelCatalog();

    const ai = buildAgentAdapter(selectedModel, { temperature, topP, topK });

    const { filteredMessages, augmentedSystemPrompt } = chatId
      ? await rebuildContext(chatId, messages, systemPrompt)
      : { filteredMessages: messages, augmentedSystemPrompt: systemPrompt ?? "" };

    const messagesToSend = await processMessagesToSend({
      messages: filteredMessages,
    });

    const prunedMessagesToSend = pruneMessages({
      messages: messagesToSend,
      reasoning: "before-last-message",
      emptyMessages: "remove",
    });

    // Turn-start persistence for existing chats. The resume registry keeps
    // serving an in-flight stream after a client reopen, but until the turn
    // persisted (only in `onFinish`) the reopened UI rendered the OLD
    // assistant message from the DB plus the replayed new turn — on a
    // regenerate this showed the replaced answer alongside its replacement
    // until the turn ended. Writing the turn's user message — and deleting
    // the message this turn replaces (`messageId`, the regenerate case; a
    // no-op otherwise) — at the START of the turn makes the DB, and thus the
    // reopen's RSC, show exactly one turn from the first frame.
    //
    // Safety: `saveMessages` is an UPSERT, so `onFinish`'s later write of the
    // same user message updates it in place. New chats (a client-only draft
    // `chatId` with no row) keep today's behavior: they cannot reattach
    // mid-turn, so nothing is written early. Failures degrade silently to
    // that same behavior (`onFinish` still writes everything). The one
    // accepted tradeoff: if the END transaction fails after this one
    // committed, the replaced message is already gone — rare, and the same
    // risk the old `onFinish`-first ordering carried in reverse.
    if (!preventChatPersistence && chatId) {
      const userMessage = messages.at(-1);
      if (userMessage?.role === "user") {
        try {
          const chat = await getChatById({ id: chatId, userId: user.id });
          if (chat) {
            await transaction(
              deleteMessageById(messageId),
              saveMessages([await chatbotMessageToDbMessage(chatId)(userMessage)]),
            );
          }
        } catch (error) {
          console.error("Failed to persist the turn's user message:", error);
        }
      }
    }

    return createUIMessageStream({
      async execute({ writer }) {
        // Routing runs once per turn, only for Auto chats without a project,
        // and must be awaited before the agent is built so the decision can be
        // emitted synchronously in the `start` metadata part below.
        const chatModeRouting: ChatModeRoutingMetadata | undefined =
          chatMode === "auto" && !projectId
            ? await resolveChatMode(
                modeRouter,
                buildChatModeRouterInput(filteredMessages),
              )
            : undefined;

        const agentInstance = await createChatModeAgent({
          ai,
          projectId,
          // Auto turns are answered with the mode the router resolved to;
          // explicit modes pass through untouched.
          chatMode: chatModeRouting?.mode ?? chatMode,
          messages: filteredMessages,
          userId: user.id,
          systemPrompt: augmentedSystemPrompt,
          webSearchNumResults,
          ragMaxResources,
          minRagResourcesScore,
        });

        const result = await agentInstance.stream({
          messages: prunedMessagesToSend,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          experimental_transform: smoothStream() as any,
        });

        writer.merge(
          result.toUIMessageStream({
            originalMessages: messages,
            sendReasoning: true,
            sendSources: true,
            generateMessageId: randomUUID,
            messageMetadata: ({ part }) => {
              switch (part.type) {
                case "start":
                  return {
                    status: "started" as const,
                    ...(chatModeRouting ? { chatModeRouting } : {}),
                  };
                case "text-start":
                  return { status: "streaming" } as const;
                case "finish":
                  return { status: "finished" } as const;
                default:
                  return undefined;
              }
            },
            onFinish: async ({ responseMessage }) => {
              try {
                const u = await result.totalUsage;
                writer.write({
                  type: "data-usage",
                  data: {
                    inputTokens: u.inputTokens ?? 0,
                    outputTokens: u.outputTokens ?? 0,
                  },
                });
              } catch {}

              const assistantMessage = responseMessage;
              const userMessage = messages.at(-1);

              if (
                userMessage?.role === "user" &&
                assistantMessage?.role === "assistant"
              ) {
                extractMemoryFacts({
                  messages: [userMessage, assistantMessage],
                  userId: user.id,
                }).catch((err) =>
                  console.error("Memory extraction failed:", err),
                );
              }

              if (preventChatPersistence) return;

              try {
                if (
                  userMessage?.role === "user" &&
                  assistantMessage?.role === "assistant"
                ) {
                  const dbChatId = await transaction(async (tx) => {
                    const updated = chatId
                      ? await updateChat(
                          { id: chatId, userId: user.id },
                          {
                            defaultModel: selectedModel,
                            defaultTemperature: temperature,
                            chatMode,
                            webSearchNumResults,
                            ragMaxResources,
                            minRagResourcesScore,
                          },
                        )(tx)
                      : undefined;

                    const ensuredChat =
                      updated ??
                      (await saveChat({
                        ...(chatId ? { id: chatId } : {}),
                        userId: user.id,
                        title: await generateTitle(messages),
                        projectId,
                        defaultModel: selectedModel,
                        defaultTemperature: temperature,
                        chatMode,
                        webSearchNumResults,
                        ragMaxResources,
                        minRagResourcesScore,
                      })(tx));

                    const { id } = ensuredChat;
                    await deleteMessageById(messageId)(tx);
                    await saveMessages(
                      await Promise.all(
                        [userMessage, assistantMessage].map(
                          chatbotMessageToDbMessage(id),
                        ),
                      ),
                    )(tx);

                    return id;
                  });

                  const resolvedChatId = chatId ?? (String(dbChatId) || "");

                  // Resume registry confirmations, only reached when the
                  // persistence transaction committed: bind the persisted
                  // chat id into the "latest stream per chat" index, then
                  // flip the entry to `persisted` (refreshing its TTL). Both
                  // are no-ops for legacy turns (no `streamKey`); skipped
                  // entirely for `preventChatPersistence` turns (early
                  // return above) and when the transaction throws (the catch
                  // below swallows persistence errors).
                  if (streamKey) {
                    if (resolvedChatId) {
                      setChatId(streamKey, resolvedChatId);
                    }
                    markPersisted(streamKey);
                  }

                  if (resolvedChatId) {
                    const modelConfig = getChatConfigurationByModelId(
                      getModelCatalogSnapshot(),
                      selectedModel,
                    );
                    const contextWindow =
                      modelConfig.contextWindow ?? config.contextWindow() ?? 128000;
                    compact(compactionAi, resolvedChatId, {
                      keepRecentTokens: getEffectiveKeepRecentTokens(contextWindow),
                      reserveTokens: getEffectiveReserveTokens(contextWindow),
                      contextWindow,
                      enabled: true,
                    }).catch((err) =>
                      console.error("Compaction failed:", err),
                    );
                  }

                  if (!chatId) {
                    writer.write({
                      type: "data-chat",
                      data: { id: dbChatId },
                    });
                  }
                }
              } catch (error) {
                console.error("Error saving message:", error);
              }
            },
            onError: (error) => {
              console.error("Error in AI response:", error);
              if (NoSuchToolError.isInstance(error)) {
                return `Tool non available: ${error.toolName}`;
              } else if (InvalidArgumentError.isInstance(error)) {
                return `The model called a tool with invalid arguments. ${error.parameter}`;
              }
              return `Runtime error: ${error}`;
            },
          }),
        );
      },
    });
  };
};
