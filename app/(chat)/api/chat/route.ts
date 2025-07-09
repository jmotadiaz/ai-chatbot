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
import { retrieve, RetrieveResult } from "@/lib/ai/retrieve";

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

  let chatModelConfiguration: ModelConfiguration | null = null;

  if (selectedModel === "Auto Model Workflow") {
    const firstMessage = messages[0];

    chatModelConfiguration = await autoModel(
      firstMessage?.content || messagePartsToText(firstMessage)
    );
  } else {
    chatModelConfiguration = {
      ...(chatModelConfigurations[selectedModel] ||
        chatModelConfigurations["Llama 4 Maverick"]),
      temperature,
      topK,
      topP,
    };
  }

  // Handle RAG if enabled
  let enhancedSystemPrompt = systemPrompt || defaultSystemPrompt;
  let retrieveResult: RetrieveResult | null = null;

  if (useRAG && messages.length > 0) {
    const userMessages = messages.filter((msg) => msg.role === "user");
    if (userMessages.length) {
      const userQuery = userMessages.reduce(
        (concatenatedMessage, msg) => `${concatenatedMessage}
        ${msg.content === "string" ? msg.content : messagePartsToText(msg)}
        `,
        ""
      );

      console.log(
        "RAG enabled, retrieving context for query:",
        userQuery.substring(0, 100)
      );

      retrieveResult = await retrieve(userQuery);

      if (retrieveResult.success && retrieveResult.contextPrompt) {
        enhancedSystemPrompt = `${retrieveResult.contextPrompt}\n\n---\n\n${enhancedSystemPrompt}`;
        console.log(
          "RAG context added to system prompt",
          retrieveResult.resources
        );
      } else {
        console.warn("RAG retrieve failed:", retrieveResult.error);
      }
    }
  }

  return createDataStreamResponse({
    execute: (dataStream) => {
      const result = streamText({
        ...chatModelConfiguration,
        system: enhancedSystemPrompt,
        messages,
        experimental_generateMessageId: generateUUID,
        experimental_transform: smoothStream({ chunking: "word" }),
        maxSteps: 5,
        experimental_telemetry: {
          isEnabled: true,
        },
        onFinish: async ({ response }) => {
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
          if (retrieveResult?.resources) {
            dataStream.writeMessageAnnotation({
              resources: retrieveResult.resources,
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
      });
    },
  });
}
