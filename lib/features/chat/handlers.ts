"use server";

import { randomUUID } from "crypto";

import type { ModelMessage, PrepareStepFunction, ToolSet } from "ai";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStream,
  smoothStream,
  NoSuchToolError,
  InvalidArgumentError,
  pruneMessages,
} from "ai";

import type { chatModelId } from "@/lib/features/foundation-model/config";
import { defaultSystemPrompt } from "@/lib/features/chat/prompts";
import {
  deleteMessageById,
  saveChat,
  saveMessages,
  updateChat,
} from "@/lib/features/chat/queries";
import {
  messagePartsToText,
  chatbotMessageToDbMessage,
  generateTitle,
} from "@/lib/features/chat/utils";
import { calculateModelConfiguration } from "@/lib/features/foundation-model/router";
import {
  URL_CONTEXT_TOOL,
  WEB_SEARCH_TOOL,
} from "@/lib/features/web-search/constants";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import {
  TOOLS,
  TOOL_PROMPTS,
  type Tool,
  type ChatbotMessage,
} from "@/lib/features/chat/types";
import {
  defaultRagMaxResources,
  defaultWebSearchNumResults,
  languageModelConfigurations,
} from "@/lib/features/foundation-model/config";
import {
  webSearchFactory,
  urlContextFactory,
} from "@/lib/features/web-search/tools";
import { hasContextUrls } from "@/lib/features/web-search/utils";
import { ragFactory } from "@/lib/features/rag/tool";
import { hasUrls } from "@/lib/utils/helpers";
import { getDb } from "@/lib/infrastructure/db/db";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";

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

const configureStep = ({
  modelConfiguration,
  systemPrompt,
  tool,
}: {
  modelConfiguration: ModelConfiguration;
  systemPrompt: string;
  tool: Tool;
}): ReturnType<PrepareStepFunction> => {
  return {
    ...(modelConfiguration.nativeToolCalling
      ? {
          system: `
            ${systemPrompt}

            ## Tools
            ${TOOL_PROMPTS[tool]}
          `,
        }
      : {
          ...languageModelConfigurations("Gemini 2.5 Flash"),
          toolChoice: { type: "tool", toolName: tool },
        }),
    activeTools: [tool],
  };
};

export async function processChatResponse({
  messages,
  selectedModel,
  temperature,
  topP,
  topK,
  chatId,
  systemPrompt = defaultSystemPrompt,
  selectedTools = [],
  messageId,
  projectId,
  preventChatPersistence = false,
  ragMaxResources = defaultRagMaxResources,
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
  selectedTools?: Array<typeof RAG_TOOL | typeof WEB_SEARCH_TOOL>;
  messageId?: string;
  projectId?: string;
  preventChatPersistence?: boolean;
  ragMaxResources?: number;
  webSearchNumResults?: number;
  user: { id: string };
}) {
  const safeRagMaxResources = Math.min(Math.max(ragMaxResources, 1), 50);
  const safeWebSearchNumResults = Math.min(
    Math.max(webSearchNumResults, 1),
    10,
  );

  return createUIMessageStream<ChatbotMessage>({
    async execute({ writer }) {
      const toolSet: ToolSet = {
        ...webSearchFactory({
          writer,
          webSearchNumResults: safeWebSearchNumResults,
        }),
        ...ragFactory({
          messages,
          userId: user.id,
          projectId,
          ragMaxResources: safeRagMaxResources,
        }),
        ...urlContextFactory({ writer }),
      };
      const { modelConfiguration, autoModelMetadata, tools } =
        await calculateModelConfiguration({
          selectedModel,
          messages,
          temperature,
          topP,
          topK,
          tools: selectedTools,
        });
      const executedTools = new Set<Tool>(
        !!(process.env.NEXT_PUBLIC_ENV === "test") ||
          modelConfiguration.toolCalling === false
          ? TOOLS
          : [],
      );
      const lastMessage = messagePartsToText(messages[messages.length - 1]);
      const isUrlPresentInLastMessage = hasUrls(lastMessage);

      // Process messages to attach text file contents from metadata
      const messagesToSend = await processMesaggesToSend({
        messages,
        modelConfiguration,
      });

      const result = streamText({
        ...modelConfiguration,
        maxRetries: 3,
        system: systemPrompt,
        messages: messagesToSend,
        tools: toolSet,
        stopWhen: stepCountIs(4),
        activeTools: [],
        experimental_transform: smoothStream(),
        experimental_telemetry: { isEnabled: true },
        prepareStep: async () => {
          if (tools.includes(RAG_TOOL) && !executedTools.has(RAG_TOOL)) {
            executedTools.add(RAG_TOOL);
            return configureStep({
              modelConfiguration,
              systemPrompt,
              tool: RAG_TOOL,
            });
          }

          if (
            !executedTools.has(URL_CONTEXT_TOOL) &&
            isUrlPresentInLastMessage &&
            (await hasContextUrls(lastMessage))
          ) {
            executedTools.add(URL_CONTEXT_TOOL);
            return configureStep({
              modelConfiguration,
              systemPrompt,
              tool: URL_CONTEXT_TOOL,
            });
          }

          if (
            tools.includes(WEB_SEARCH_TOOL) &&
            !executedTools.has(WEB_SEARCH_TOOL)
          ) {
            executedTools.add(WEB_SEARCH_TOOL);
            return configureStep({
              modelConfiguration,
              systemPrompt,
              tool: WEB_SEARCH_TOOL,
            });
          }
        },
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
                  autoModel: autoModelMetadata,
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
                          ragMaxResources: safeRagMaxResources,
                          webSearchNumResults: safeWebSearchNumResults,
                          tools,
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
                      ragMaxResources: safeRagMaxResources,
                      webSearchNumResults: safeWebSearchNumResults,
                      tools,
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
