"use server";

import { randomUUID } from "crypto";

import type { ModelMessage } from "ai";
import {
  convertToModelMessages,
  createUIMessageStream,
  smoothStream,
  NoSuchToolError,
  InvalidArgumentError,
  pruneMessages,
} from "ai";

import type { chatModelId } from "@/lib/features/foundation-model/config";
import {
  languageModelConfigurations,
  chatModelKeys,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/config";
import { defaultSystemPrompt } from "@/lib/features/chat/prompts";
import {
  deleteMessageById,
  saveChat,
  saveMessages,
  updateChat,
} from "@/lib/features/chat/queries";
import {
  chatbotMessageToDbMessage,
  generateTitle,
} from "@/lib/features/chat/utils";
import { type ChatbotMessage, type Agent } from "@/lib/features/chat/types";
import { getDb } from "@/lib/infrastructure/db/db";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { createAgent } from "@/lib/features/chat/agents/factory";

const processMesaggesToSend = async ({
  messages,
  modelConfiguration,
}: {
  messages: ChatbotMessage[];
  modelConfiguration: ModelConfiguration;
}): Promise<ModelMessage[]> => {
  // Convert to model messages and prune reasoning parts if model doesn't support reasoning
  const modelMessages = await convertToModelMessages(
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
  return modelConfiguration.reasoning
    ? modelMessages
    : pruneMessages({
        messages: modelMessages,
        reasoning: "all",
      });
};

export async function processChatResponse({
  messages,
  selectedModel,
  temperature,
  topP,
  topK,
  chatId,
  systemPrompt = defaultSystemPrompt,
  messageId,
  projectId,
  preventChatPersistence = false,
  agent = "rag",

  webSearchNumResults = defaultWebSearchNumResults,
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
  user: { id: string };
}) {
  const safeWebSearchNumResults = Math.min(
    Math.max(webSearchNumResults, 1),
    10,
  );

  return createUIMessageStream<ChatbotMessage>({
    async execute({ writer }) {
      let modelId = selectedModel;
      if (modelId === "Router") {
        modelId = chatModelKeys[0];
      }

      const modelConfig: ModelConfiguration =
        languageModelConfigurations(modelId) ||
        languageModelConfigurations(chatModelKeys[0]);

      const modelConfiguration = {
        ...modelConfig,
        temperature: temperature ?? modelConfig.temperature,
        topP: topP ?? modelConfig.topP,
        topK: topK ?? modelConfig.topK,
      };

      const messagesToSend = await processMesaggesToSend({
        messages,
        modelConfiguration,
      });

      const agentInstance = await createAgent({
        projectId,
        agent,
        modelConfiguration,
        messages,
        userId: user.id,
        systemPrompt,
        selectedModel,
        webSearchNumResults: safeWebSearchNumResults,
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
                return { status: "started" };
              case "text-start":
                return { status: "streaming" };
              case "finish":
                return {
                  status: "finished",
                };
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
                console.log("Saving chat and messages...", chatId);
                const dbChatId = await getDb().transaction(async (tx) => {
                  const updated = chatId
                    ? await updateChat(
                        { id: chatId, userId: user.id },
                        {
                          defaultModel: selectedModel,
                          defaultTemperature: temperature,
                          agent,
                          webSearchNumResults: safeWebSearchNumResults,
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
                      agent,
                      webSearchNumResults: safeWebSearchNumResults,
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
                if (!chatId) {
                  writer.write({
                    type: "data-chat",
                    data: {
                      id: dbChatId,
                    },
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
}
