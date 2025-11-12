import { randomUUID } from "crypto";
import type { ToolSet } from "ai";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStreamResponse,
  createUIMessageStream,
  smoothStream,
  NoSuchToolError,
  InvalidArgumentError,
} from "ai";
import type { chatModelId } from "@/lib/ai/models/definition";
import { providers } from "@/lib/ai/models/providers";
import { defaultSystemPrompt } from "@/lib/ai/prompts";
import {
  deleteMessageById,
  saveChat,
  saveMessages,
  updateChat,
} from "@/lib/db/queries";
import {
  messagePartsToText,
  chatbotMessageToDbMessage,
  generateTitle,
} from "@/lib/ai/utils";
import { calculateModelConfiguration } from "@/lib/ai/models/utils";
import type { Tool } from "@/lib/ai/tools/types";
import {
  WEB_SEARCH_TOOL,
  URL_CONTEXT_TOOL,
  RAG_TOOL,
  TOOLS,
} from "@/lib/ai/tools/types";
import {
  defaultRagSimilarityPercentage,
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/ai/models/definition";
import {
  hasContextUrls,
  urlContextFactory,
  webSearchFactory,
} from "@/lib/ai/tools/web-search";
import { ragFactory } from "@/lib/ai/tools/rag";
import type { ChatbotMessage } from "@/lib/ai/types";
import { hasUrls } from "@/lib/utils";
import { getDb } from "@/lib/db/db";
import { withAuth } from "@/lib/auth/handlers";

export const maxDuration = 240;

export const POST = withAuth(async (user, req) => {
  const {
    messages,
    selectedModel,
    temperature,
    chatId,
    systemPrompt = defaultSystemPrompt,
    tools: selectedTools = [],
    messageId,
    projectId,
    preventChatPersistence = false,
    ragSimilarityPercentage = defaultRagSimilarityPercentage,
    ragMaxResources = defaultRagMaxResources,
    webSearchNumResults = defaultWebSearchNumResults,
  }: {
    messages: ChatbotMessage[];
    selectedModel: chatModelId;
    temperature?: number;
    chatId?: string;
    systemPrompt?: string;
    tools?: Array<typeof RAG_TOOL | typeof WEB_SEARCH_TOOL>;
    messageId?: string;
    projectId?: string;
    preventChatPersistence?: boolean;
    ragSimilarityPercentage?: number;
    ragMaxResources?: number;
    webSearchNumResults?: number;
  } = await req.json();

  // Clamp incoming tool configuration values to safe ranges
  const safeRagSimilarityPercentage = Math.min(
    Math.max(ragSimilarityPercentage, 0),
    100
  );
  const safeRagMaxResources = Math.min(Math.max(ragMaxResources, 1), 50);
  const safeWebSearchNumResults = Math.min(
    Math.max(webSearchNumResults, 1),
    10
  );

  const stream = createUIMessageStream<ChatbotMessage>({
    async execute({ writer }) {
      const toolSet: ToolSet = {
        ...webSearchFactory({
          writer,
          webSearchNumResults: safeWebSearchNumResults,
        }),
        ...ragFactory({
          messages,
          userId: user.id,
          ragMaxResources: safeRagMaxResources,
          ragSimilarityPercentage: safeRagSimilarityPercentage,
        }),
        ...urlContextFactory({ writer }),
      };
      const { modelConfiguration, autoModelMetadata, tools } =
        await calculateModelConfiguration({
          selectedModel,
          messages,
          temperature,
          tools: selectedTools,
        });
      const executedTools = new Set<Tool>(
        !!process.env.USE_MOCK_PROVIDERS ||
        modelConfiguration.toolCalling === false
          ? TOOLS
          : []
      );
      const lastMessage = messagePartsToText(messages[messages.length - 1]);
      const isUrlPresentInLastMessage = hasUrls(lastMessage);
      let reasoning = false;

      const result = streamText({
        ...modelConfiguration,
        ...((tools.length > 0 || isUrlPresentInLastMessage) && {
          providerOptions: {
            ...modelConfiguration.providerOptions,
            anthropic: {
              ...modelConfiguration.providerOptions?.anthropic,
              sendReasoning: false,
              thinking: { type: "disabled" },
            },
          },
        }),
        system: systemPrompt,
        messages: convertToModelMessages(messages),
        tools: toolSet,
        stopWhen: stepCountIs(4),
        activeTools: [],
        experimental_transform: smoothStream(),
        experimental_telemetry: { isEnabled: true },
        prepareStep: async ({ stepNumber }) => {
          if (tools.includes(RAG_TOOL) && !executedTools.has(RAG_TOOL)) {
            executedTools.add(RAG_TOOL);
            return {
              model: providers.google("gemini-2.5-flash-lite"),
              toolChoice: { type: "tool", toolName: RAG_TOOL },
              activeTools: [RAG_TOOL],
            };
          }

          if (
            !executedTools.has(URL_CONTEXT_TOOL) &&
            isUrlPresentInLastMessage &&
            (await hasContextUrls(lastMessage))
          ) {
            executedTools.add(URL_CONTEXT_TOOL);
            return {
              model: providers.google("gemini-2.5-flash-lite"),
              toolChoice: { type: "tool", toolName: URL_CONTEXT_TOOL },
              activeTools: [URL_CONTEXT_TOOL],
            };
          }

          if (
            tools.includes(WEB_SEARCH_TOOL) &&
            !executedTools.has(WEB_SEARCH_TOOL)
          ) {
            executedTools.add(WEB_SEARCH_TOOL);
            return {
              model: providers.google("gemini-2.5-flash-lite"),
              toolChoice: { type: "tool", toolName: WEB_SEARCH_TOOL },
              activeTools: [WEB_SEARCH_TOOL],
            };
          }

          if (stepNumber >= tools.length && modelConfiguration.reasoning) {
            writer.write({
              type: "data-reasoning",
              data: {
                status: "started",
              },
            });
            reasoning = true;
          }
        },
        onChunk: ({ chunk }) => {
          if (chunk.type === "reasoning-delta" && !reasoning) {
            writer.write({
              type: "data-reasoning",
              data: {
                status: "started",
              },
            });
            reasoning = true;
          }
          if (chunk.type !== "reasoning-delta" && reasoning) {
            writer.write({
              type: "data-reasoning",
              data: {
                status: "finished",
              },
            });
            reasoning = false;
          }
        },
      });

      writer.merge(
        result.toUIMessageStream({
          originalMessages: messages,
          sendReasoning: false,
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
                  const { id } = chatId
                    ? await updateChat(
                        { id: chatId, userId: user.id },
                        {
                          defaultModel: selectedModel,
                          defaultTemperature: temperature,
                          tools,
                        }
                      )(tx)
                    : await saveChat({
                        userId: user.id,
                        title: await generateTitle(messages),
                        projectId,
                        defaultModel: selectedModel,
                        defaultTemperature: temperature,
                        tools,
                      })(tx);
                  await deleteMessageById(messageId)(tx);
                  await saveMessages(
                    await Promise.all(
                      [userMessage, assistantMessage].map(
                        chatbotMessageToDbMessage(id)
                      )
                    )
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
        })
      );
    },
  });

  return createUIMessageStreamResponse({ stream });
});
