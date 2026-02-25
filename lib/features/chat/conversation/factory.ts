import { randomUUID } from "node:crypto";
import {
  createUIMessageStream,
  smoothStream,
  convertToModelMessages,
  NoSuchToolError,
  InvalidArgumentError,
} from "ai";
import type { ModelMessage } from "ai";
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
} from "@/lib/features/foundation-model/config";
import type { ModelConfiguration } from "@/lib/features/foundation-model/types";
import {
  generateTitle,
  chatbotMessageToDbMessage,
} from "@/lib/features/chat/utils";
import { createAgent } from "@/lib/features/chat/agents/factory";

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
    agent = "rag",
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

    const messagesToSend = await processMessagesToSend({ messages });

    return createUIMessageStream({
      async execute({ writer }) {
        const agentInstance = await createAgent({
          ai,
          projectId,
          agent,
          messages,
          userId: user.id,
          systemPrompt,
          webSearchNumResults,
          ragMaxResources,
          minRagResourcesScore,
          projectPort,
        });

        const result = await agentInstance.stream({
          messages: messagesToSend,
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
              if (preventChatPersistence) return;

              try {
                const assistantMessage = responseMessage;
                const userMessage = messages.at(-1);

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
