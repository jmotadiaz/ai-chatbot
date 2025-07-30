import { randomUUID } from "crypto";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStreamResponse,
  createUIMessageStream,
  smoothStream,
  ToolSet,
} from "ai";
import {
  chatModelConfigurations,
  chatModelId,
  languageModelConfigurations,
  ModelConfiguration,
} from "@/lib/ai/models";
import { defaultSystemPrompt } from "@/lib/ai/prompts";
import {
  deleteMessageById,
  saveMessages,
  transaction,
  updateChat,
} from "@/lib/db/queries";
import { auth } from "@/auth";
import { messagePartsToText, messageToDbMessage } from "@/lib/ai/utils";
import { autoModel } from "@/lib/ai/workflows/auto-model";
import {
  hasContextUrls,
  urlContextFactory,
  webSearchFactory,
} from "@/lib/ai/tools/web-search";
import { ChatbotMessage } from "@/lib/ai/types";
import { ragFactory } from "@/lib/ai/tools/rag";
import { hasUrls } from "@/lib/utils";

export const maxDuration = 60;

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
    reloadedMessageId,
    useRAG,
    useWebSearch,
  }: {
    messages: ChatbotMessage[];
    selectedModel: chatModelId;
    temperature?: number;
    topP?: number;
    topK?: number;
    chatId?: string;
    systemPrompt?: string;
    reloadedMessageId?: string;
    useRAG?: boolean;
    useWebSearch?: boolean;
  } = await req.json();

  let chatModelConfiguration: Promise<ModelConfiguration> | null = null;

  if (selectedModel === "Auto Model Workflow") {
    const firstMessage = messages[0];

    chatModelConfiguration = autoModel(
      firstMessage ? messagePartsToText(firstMessage) : ""
    );
  } else {
    chatModelConfiguration = Promise.resolve({
      ...(chatModelConfigurations[selectedModel] ||
        chatModelConfigurations["Llama 4 Maverick"]),
      temperature,
      topK,
      topP,
    });
  }

  const modelConfig = await chatModelConfiguration;
  let startChunking = false;

  return createUIMessageStreamResponse({
    stream: createUIMessageStream<ChatbotMessage>({
      execute({ writer }) {
        const tools: ToolSet = {
          ...webSearchFactory({ writer }),
          ...ragFactory({ writer }),
          ...urlContextFactory({ writer }),
        };
        const executedTools = new Set<keyof typeof tools>();
        const result = streamText({
          ...modelConfig,
          system: systemPrompt || defaultSystemPrompt,
          messages: convertToModelMessages(messages),
          tools,
          stopWhen: stepCountIs(4),
          prepareStep: async ({ model }) => {
            const provider =
              typeof model === "string" ? "unknown" : model.provider;
            const lastMessage = messagePartsToText(
              messages[messages.length - 1]
            );
            if (
              provider !== "perplexity" &&
              !executedTools.has("urlContext") &&
              hasUrls(lastMessage) &&
              (await hasContextUrls(lastMessage))
            ) {
              executedTools.add("urlContext");
              return {
                ...languageModelConfigurations["Gemini 2.0 Flash"],
                toolChoice: { type: "tool", toolName: "urlContext" },
                activeTools: ["urlContext"],
              };
            }

            if (
              provider !== "perplexity" &&
              useWebSearch &&
              !executedTools.has("webSearch")
            ) {
              executedTools.add("webSearch");
              return {
                ...languageModelConfigurations["Gemini 2.0 Flash"],
                toolChoice: { type: "tool", toolName: "webSearch" },
                activeTools: ["webSearch"],
              };
            }

            if (useRAG && !executedTools.has("rag")) {
              executedTools.add("rag");
              return {
                ...languageModelConfigurations["Gemini 2.0 Flash"],
                toolChoice: { type: "tool", toolName: "rag" },
                activeTools: ["rag"],
              };
            }
          },
          activeTools: ["webSearch"],
          experimental_transform: smoothStream(),
          experimental_telemetry: {
            isEnabled: true,
          },
          onChunk: () => {
            if (!startChunking) {
              startChunking = true;
              writer.write({
                type: "data-notification",
                data: { status: "streaming" },
                transient: true,
              });
            }
          },
          onFinish: async ({ response }) => {
            if (chatId) {
              try {
                // In v5, we handle message persistence differently
                const userMessage = messages.at(-1);
                const assistantMessage = response.messages.at(-1);

                if (
                  userMessage?.role === "user" &&
                  assistantMessage?.role === "assistant"
                ) {
                  // Save the user and assistant messages to the database
                  await transaction([
                    updateChat(
                      { id: chatId, userId: session.user.id },
                      {
                        defaultModel: selectedModel,
                        defaultTemperature: temperature,
                        defaultTopP: topP,
                      }
                    ),
                    ...(reloadedMessageId
                      ? [
                          deleteMessageById(reloadedMessageId),
                          saveMessages([
                            messageToDbMessage(chatId)({
                              id: randomUUID(),
                              role: "assistant",
                              parts: assistantMessage.content,
                            } as ChatbotMessage),
                          ]),
                        ]
                      : [
                          saveMessages(
                            [
                              userMessage,
                              {
                                id: randomUUID(),
                                role: "assistant",
                                parts: assistantMessage.content,
                              } as ChatbotMessage,
                            ].map(messageToDbMessage(chatId))
                          ),
                        ]),
                  ]);
                }
              } catch (error) {
                console.error("Error saving message:", error);
              }
            }
          },
          onError: (error) => {
            console.log("Error Inferring", error.error);
          },
        });

        writer.merge(
          result.toUIMessageStream({
            originalMessages: messages,
            sendReasoning: true,
            sendSources: true,
            generateMessageId: randomUUID,
            onFinish() {
              // Handle any final processing here if needed
            },
          })
        );
      },
    }),
  });
}
