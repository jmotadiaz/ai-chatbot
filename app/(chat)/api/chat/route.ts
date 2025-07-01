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
} from "@/lib/ai/providers";
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
  }: {
    messages: UIMessage[];
    selectedModel: chatModelId;
    temperature?: number;
    topP?: number;
    topK?: number;
    chatId?: string;
    systemPrompt?: string;
    reloadedMessageId?: string;
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

  return createDataStreamResponse({
    execute: (dataStream) => {
      const result = streamText({
        ...chatModelConfiguration,
        system: systemPrompt || defaultSystemPrompt,
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
        },
      });

      result.consumeStream();

      result.mergeIntoDataStream(dataStream, {
        sendReasoning: true,
      });
    },
  });
}
