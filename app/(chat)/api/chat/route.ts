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
import { chatModelId, languageModelConfigurations } from "@/lib/ai/models";
import { defaultSystemPrompt } from "@/lib/ai/prompts";
import {
  deleteMessageById,
  saveMessages,
  transaction,
  updateChat,
} from "@/lib/db/queries";
import { auth } from "@/auth";
import { messagePartsToText, messageToDbMessage } from "@/lib/ai/utils";
import { calculateModelConfiguration } from "@/lib/ai/workflows/auto-model";
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

  const stream = createUIMessageStream<ChatbotMessage>({
    async execute({ writer }) {
      writer.write({
        type: "data-notification",
        data: { status: "submitted" },
      });
      const tools: ToolSet = {
        ...webSearchFactory({ writer }),
        ...ragFactory({ writer }),
        ...urlContextFactory({ writer }),
      };
      const executedTools = new Set<keyof typeof tools>();
      const chatModelConfiguration = await calculateModelConfiguration(
        selectedModel,
        messages,
        temperature,
        topP,
        topK
      );

      const result = streamText({
        ...chatModelConfiguration,
        system: systemPrompt || defaultSystemPrompt,
        messages: convertToModelMessages(messages),
        tools,
        stopWhen: stepCountIs(4),
        activeTools: [],
        experimental_transform: smoothStream(),
        experimental_telemetry: { isEnabled: true },
        prepareStep: async ({ model }) => {
          const provider =
            typeof model === "string" ? "unknown" : model.provider;
          const lastMessage = messagePartsToText(messages[messages.length - 1]);

          if (
            provider !== "perplexity" &&
            !executedTools.has("urlContext") &&
            hasUrls(lastMessage) &&
            (await hasContextUrls(lastMessage))
          ) {
            executedTools.add("urlContext");
            return {
              ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
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
              ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
              toolChoice: { type: "tool", toolName: "webSearch" },
              activeTools: ["webSearch"],
            };
          }

          if (useRAG && !executedTools.has("rag")) {
            executedTools.add("rag");
            return {
              ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
              toolChoice: { type: "tool", toolName: "rag" },
              activeTools: ["rag"],
            };
          }
        },
        onStepFinish: () => {
          writer.write({
            type: "data-notification",
            data: { status: "submitted" },
          });
        },
        onChunk: () => {
          writer.write({
            type: "data-notification",
            data: { status: "streaming" },
          });
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
          messageMetadata: ({ part }) => {
            switch (part.type) {
              case "start":
                return { status: "started" };
              case "finish":
                return { status: "finished" };
              default:
                return undefined;
            }
          },
          onFinish: async ({ messages }) => {
            if (chatId) {
              try {
                const assistantMessage = messages.at(-1);
                const userMessage = messages.at(-2);

                if (
                  userMessage?.role === "user" &&
                  assistantMessage?.role === "assistant"
                ) {
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
                            messageToDbMessage(chatId)(assistantMessage),
                          ]),
                        ]
                      : [
                          saveMessages(
                            [userMessage, assistantMessage].map(
                              messageToDbMessage(chatId)
                            )
                          ),
                        ]),
                  ]);
                }
              } catch (error) {
                console.error("Error saving message:", error);
              }
            }
          },
        })
      );
    },
  });

  return createUIMessageStreamResponse({ stream });
}
