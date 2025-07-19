import {
  streamText,
  UIMessage,
  smoothStream,
  appendResponseMessages,
  createDataStreamResponse,
} from "ai";
import {
  chatModelConfigurations,
  chatModelId,
  ModelConfiguration,
} from "@/lib/ai/models";
import { defaultSystemPrompt } from "@/lib/ai/prompts";
import { generateUUID } from "@/lib/utils";
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
  buildContextPrompt,
  retrieve,
  RetrieveResult,
  translateToEnglish,
} from "@/lib/ai/rag/retrieve";

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
  }: {
    messages: UIMessage[];
    selectedModel: chatModelId;
    temperature?: number;
    topP?: number;
    topK?: number;
    chatId?: string;
    systemPrompt?: string;
    reloadedMessageId?: string;
    useRAG?: boolean;
  } = await req.json();

  return createDataStreamResponse({
    execute: async (dataStream) => {
      let chatModelConfiguration: Promise<ModelConfiguration> | null = null;
      let retrieveResult: RetrieveResult | null = null;

      if (selectedModel === "Auto Model Workflow") {
        const firstMessage = messages[0];

        chatModelConfiguration = autoModel(
          firstMessage?.content || messagePartsToText(firstMessage)
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

      let enhancedSystemPrompt = systemPrompt || defaultSystemPrompt;

      if (useRAG && messages.length > 0) {
        const userMessages = messages.filter((msg) => msg.role === "user");
        if (userMessages.length) {
          retrieveResult = await retrieve(
            await translateToEnglish(
              userMessages.reduce(
                (concatenatedMessage, msg) => `
              ${concatenatedMessage}
              ${
                msg.content === "string" ? msg.content : messagePartsToText(msg)
              }
          `,
                ""
              )
            )
          );

          if (retrieveResult.success && retrieveResult.similarChunks) {
            enhancedSystemPrompt = `${enhancedSystemPrompt}\n---\n${buildContextPrompt(
              retrieveResult.similarChunks
            )}`;
            console.log(
              "RAG context added to system prompt",
              retrieveResult.resources
            );
          } else {
            console.error("RAG retrieve failed:", retrieveResult.error);
          }
        }
      }

      const result = streamText({
        ...(await chatModelConfiguration),
        system: enhancedSystemPrompt,
        toolChoice: { type: "tool", toolName: "web_search_preview" },
        experimental_generateMessageId: generateUUID,
        experimental_transform: smoothStream({ chunking: "word" }),
        maxSteps: 5,
        experimental_telemetry: {
          isEnabled: true,
        },
        onFinish: async ({ response, usage }) => {
          if (chatId) {
            try {
              const allMessages = appendResponseMessages({
                messages,
                responseMessages: response.messages,
              });
              const userMessage = allMessages.at(-2);
              const assistantMessage = allMessages.at(-1);

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
          dataStream.writeData({
            type: "usage",
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          });

          if (retrieveResult?.resources) {
            retrieveResult.resources.forEach((resource) => {
              dataStream.writeSource({
                id: generateUUID(),
                sourceType: "url",
                url: resource,
                title: resource,
              });
            });
          }
        },
        onError: (error) => {
          console.log("Error Inferring", error);
        },
      });

      result.consumeStream();

      result.mergeIntoDataStream(dataStream, {
        sendReasoning: true,
        sendSources: true,
      });
    },
  });
}
