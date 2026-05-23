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
import { eq } from "drizzle-orm";
import {
  ChatDbPort,
  ChatAgentAiPort,
  ProjectPort,
} from "@/lib/features/chat/conversation/ports";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import type { ChatbotMessage, Agent } from "@/lib/features/chat/types";
import {
  languageModelConfigurations,
  chatModelKeys,
  defaultWebSearchNumResults,
  getChatConfigurationByModelId,
} from "@/lib/features/foundation-model/config";
import type { ModelConfiguration } from "@/lib/features/foundation-model/types";
import {
  generateTitle,
  chatbotMessageToDbMessage,
} from "@/lib/features/chat/utils";
import { createAgent } from "@/lib/features/chat/agents/factory";
import { extractMemoryFacts } from "@/lib/features/memory/extraction";
import { compact } from "@/lib/features/compaction/orchestration";
import { getLatestSummary } from "@/lib/features/compaction/repository";
import {
  DEFAULT_KEEP_RECENT_TOKENS,
  DEFAULT_RESERVE_TOKENS,
} from "@/lib/features/compaction/types";
import { getDb } from "@/lib/infrastructure/db/db";
import { message as messageTable } from "@/lib/infrastructure/db/schema";

const processMessagesToSend = async ({
  messages,
}: {
  messages: ChatbotMessage[];
}): Promise<ModelMessage[]> => {
  return convertToModelMessages(
    messages.map((msg) => {
      if (msg.role === "user" && msg.metadata?.textFiles?.length) {
        const textFileContents = msg.metadata.textFiles
          .map(
            (f) => `\n\n---\nAttached File: ${f.filename}\n${f.content}\n---`,
          )
          .join("");

        return {
          ...msg,
          parts: msg.parts.map((part) =>
            part.type === "text"
              ? { ...part, text: part.text + textFileContents }
              : part,
          ),
        };
      }
      return msg;
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
      languageModelConfigurations(selectedModel) ||
      languageModelConfigurations(chatModelKeys[0]);
    return {
      ...base,
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
  };
};

export const makeProcessChatResponse = <Tx = unknown>(
  db: ChatDbPort<Tx>,
  projectPort: ProjectPort,
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
    agent = "context7",
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
    agent?: Agent;
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

    let filteredMessages = messages;
    let augmentedSystemPrompt = systemPrompt;

    if (chatId) {
      try {
        const summary = await getLatestSummary(chatId);
        if (summary) {
          const db = getDb();
          const summaryMessage = await db
            .select()
            .from(messageTable)
            .where(eq(messageTable.id, summary.messageId))
            .limit(1);

          if (summaryMessage[0]?.serial) {
            const allDbMessages = await db
              .select({ id: messageTable.id, serial: messageTable.serial })
              .from(messageTable)
              .where(eq(messageTable.chatId, chatId));

            const summarySerial = summaryMessage[0].serial;
            const serialMap = new Map(
              allDbMessages.map((m) => [m.id, m.serial]),
            );

            filteredMessages = messages.filter((msg) => {
              const serial = serialMap.get(msg.id);
              return serial ? serial > summarySerial : true;
            });

            augmentedSystemPrompt = `## Previous Context\n${summary.summary}\n\n${systemPrompt ?? ""}`;
          }
        }
      } catch (err) {
        console.error("Context rebuild failed:", err);
      }
    }

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
        const agentInstance = await createAgent({
          ai,
          projectId,
          agent,
          messages: filteredMessages,
          userId: user.id,
          systemPrompt: augmentedSystemPrompt,
          webSearchNumResults,
          ragMaxResources,
          minRagResourcesScore,
          projectPort,
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
                  return { status: "started" } as const;
                case "text-start":
                  return { status: "streaming" } as const;
                case "finish":
                  return { status: "finished" } as const;
                default:
                  return undefined;
              }
            },
            onFinish: async ({ responseMessage }) => {
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
                  const dbChatId = await db.transaction(async (tx) => {
                    const updated = chatId
                      ? await db.updateChat(
                          { id: chatId, userId: user.id },
                          {
                            defaultModel: selectedModel,
                            defaultTemperature: temperature,
                            agent,
                            webSearchNumResults,
                            ragMaxResources,
                            minRagResourcesScore,
                          },
                        )(tx as Tx)
                      : undefined;

                    const ensuredChat =
                      updated ??
                      (await db.saveChat({
                        ...(chatId ? { id: chatId } : {}),
                        userId: user.id,
                        title: await generateTitle(messages),
                        projectId,
                        defaultModel: selectedModel,
                        defaultTemperature: temperature,
                        agent,
                        webSearchNumResults,
                        ragMaxResources,
                        minRagResourcesScore,
                      })(tx as Tx));

                    const { id } = ensuredChat;
                    await db.deleteMessageById(messageId)(tx as Tx);
                    await db.saveMessages(
                      await Promise.all(
                        [userMessage, assistantMessage].map(
                          chatbotMessageToDbMessage(id),
                        ),
                      ),
                    )(tx as Tx);

                    return id;
                  });

                  const resolvedChatId = chatId ?? (String(dbChatId) || "");
                  if (resolvedChatId) {
                    const modelConfig = getChatConfigurationByModelId(
                      selectedModel,
                    );
                    compact(resolvedChatId, {
                      keepRecentTokens: DEFAULT_KEEP_RECENT_TOKENS,
                      reserveTokens: DEFAULT_RESERVE_TOKENS,
                      contextWindow:
                        modelConfig.contextWindow ?? undefined,
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
