import { randomUUID } from "crypto";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStreamResponse,
  createUIMessageStream,
  smoothStream,
  ToolSet,
  NoSuchToolError,
  InvalidArgumentError,
} from "ai";
import {
  chatModelId,
  languageModelConfigurations,
} from "@/lib/ai/models/definition";
import { defaultSystemPrompt } from "@/lib/ai/prompts";
import {
  db,
  deleteMessageById,
  saveChat,
  saveMessages,
  updateChat,
} from "@/lib/db/queries";
import { auth } from "@/auth";
import {
  messagePartsToText,
  chatbotMessageToDbMessage,
  generateTitle,
} from "@/lib/ai/utils";
import { calculateModelConfiguration } from "@/lib/ai/models/utils";
import {
  WEB_SEARCH_TOOL,
  URL_CONTEXT_TOOL,
  RAG_TOOL,
  Tool,
} from "@/lib/ai/tools/types";
import {
  hasContextUrls,
  urlContextFactory,
  webSearchFactory,
} from "@/lib/ai/tools/web-search";
import { ragFactory } from "@/lib/ai/tools/rag";
import { ChatbotMessage } from "@/lib/ai/types";
import { hasUrls } from "@/lib/utils";

export const maxDuration = 240;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const {
    messages,
    selectedModel,
    temperature,
    topP,
    topK,
    chatId,
    systemPrompt,
    tools: selectedTools = [],
    messageId,
    projectId,
    preventChatPersistence = false,
  }: {
    messages: ChatbotMessage[];
    selectedModel: chatModelId;
    temperature?: number;
    topP?: number;
    topK?: number;
    chatId?: string;
    systemPrompt?: string;
    tools?: Array<typeof RAG_TOOL | typeof WEB_SEARCH_TOOL>;
    messageId?: string;
    projectId?: string;
    preventChatPersistence?: boolean;
  } = await req.json();

  const stream = createUIMessageStream<ChatbotMessage>({
    async execute({ writer }) {
      const toolSet: ToolSet = {
        ...webSearchFactory({ writer }),
        ...ragFactory({ writer, userId: session.user.id }),
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
      const executedTools = new Set<Tool>(modelConfiguration.disabledTools);
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
        system: systemPrompt || defaultSystemPrompt,
        messages: convertToModelMessages(messages),
        tools: toolSet,
        stopWhen: stepCountIs(4),
        activeTools: [],
        experimental_transform: smoothStream(),
        experimental_telemetry: { isEnabled: true },
        prepareStep: async ({ stepNumber, model }) => {
          const modelName = typeof model === "string" ? model : model.modelId;

          if (tools.includes(RAG_TOOL) && !executedTools.has(RAG_TOOL)) {
            executedTools.add(RAG_TOOL);
            return {
              ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
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
              ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
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
              ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
              toolChoice: { type: "tool", toolName: WEB_SEARCH_TOOL },
              activeTools: [WEB_SEARCH_TOOL],
            };
          }

          if (
            stepNumber >= tools.length &&
            (modelName.includes("gpt-5") || modelName.includes("grok-4"))
          ) {
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
                return { status: "finished", autoModel: autoModelMetadata };
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
                  const { id } = chatId
                    ? await updateChat(
                        { id: chatId, userId: session.user.id },
                        {
                          defaultModel: selectedModel,
                          defaultTemperature: temperature,
                          defaultTopP: topP,
                          defaultTopK: topK,
                          tools,
                        }
                      )(tx)
                    : await saveChat({
                        userId: session.user.id,
                        title: await generateTitle(messages),
                        projectId,
                        defaultModel: selectedModel,
                        defaultTemperature: temperature,
                        defaultTopP: topP,
                        defaultTopK: topK,
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
}
