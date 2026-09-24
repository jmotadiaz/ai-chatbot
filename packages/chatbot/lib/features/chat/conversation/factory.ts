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
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { isTracingEnabled, wrapWithTracing } from "tracing";
import { config } from "config";
import type { ModelConfiguration } from "inference";
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
  chatModelKeys,
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
} from "@/lib/features/chat/queries";
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

/** Builds a ChatAgentAiPort where all agents use the same user-selected model + overrides */
const buildAgentAdapter = (
  selectedModel: chatModelId,
  overrides: { temperature?: number; topP?: number; topK?: number },
): ChatAgentAiPort => {
  const getConfig = (): ModelConfiguration => {
    const base =
      inferenceKit.languageModel(selectedModel) ||
      inferenceKit.languageModel(chatModelKeys[0]);
    const tracedModel = isTracingEnabled()
      ? wrapWithTracing(
          base.model as LanguageModelV3,
          config.traceRunId() ?? "default",
        )
      : base.model;
    return {
      ...base,
      model: tracedModel,
      temperature: overrides.temperature ?? base.temperature,
      topP: overrides.topP ?? base.topP,
      topK: overrides.topK ?? base.topK,
    };
  };

  return {
    getRagModelConfiguration: getConfig,
    getWebSearchModelConfiguration: getConfig,
    getContext7ModelConfiguration: getConfig,
    getProjectModelConfiguration: getConfig,
    getNeutralModelConfiguration: getConfig,
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
    webSearchNumResults?: number;
    ragMaxResources?: number;
    minRagResourcesScore?: number;
    user: { id: string };
  }) => {
    // Return early if no user
    if (!user?.id) {
      throw new Error("Unauthorized");
    }

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
                  if (resolvedChatId) {
                    const modelConfig = getChatConfigurationByModelId(
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
