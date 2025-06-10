import {
  streamText,
  UIMessage,
  smoothStream,
  appendResponseMessages,
  createDataStreamResponse,
} from "ai";
import { model, modelID } from "@/lib/ai/providers";
import { defaultSystemPrompt } from "@/lib/ai/prompts";
import { generateUUID } from "@/lib/utils";
import {
  deleteMessagesById,
  saveMessages,
  transaction,
  updateChat,
} from "@/lib/db/queries";
import { auth } from "@/auth";
import { messageToDbMessage } from "@/lib/ai/utils";

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
    chatId,
    systemPrompt,
    reloadedMessageId,
  }: {
    messages: UIMessage[];
    selectedModel: modelID;
    temperature?: number;
    topP?: number;
    chatId?: string;
    systemPrompt?: string;
    reloadedMessageId?: string;
  } = await req.json();

  return createDataStreamResponse({
    execute: (dataStream) => {
      const result = streamText({
        model: model.languageModel(selectedModel),
        system: systemPrompt || defaultSystemPrompt,
        messages,
        temperature,
        topP,
        experimental_generateMessageId: generateUUID,
        experimental_transform: smoothStream({ chunking: "word" }),
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
                await transaction([
                  updateChat(chatId, {
                    defaultModel: selectedModel,
                    defaultTemperature: temperature,
                    defaultTopP: topP,
                  }),
                  ...(reloadedMessageId
                    ? [
                        deleteMessagesById({
                          id: reloadedMessageId,
                        }),
                        saveMessages({
                          messages: [messageToDbMessage(chatId)(userMessage)],
                        }),
                      ]
                    : [
                        saveMessages({
                          messages: [userMessage, assistantMessage].map(
                            messageToDbMessage(chatId)
                          ),
                        }),
                      ]),
                ]);
              }
            } catch (error) {
              console.error("Error saving message:", error);
            }
          }
        },
      });

      result.consumeStream();

      result.mergeIntoDataStream(dataStream, {
        sendReasoning: true,
      });
    },
  });
}
