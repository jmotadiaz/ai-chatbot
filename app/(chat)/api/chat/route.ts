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
import { autoModel, AutoModelCalculated } from "@/lib/ai/workflows/auto-model";

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
    selectedModel: chatModelId;
    temperature?: number;
    topP?: number;
    chatId?: string;
    systemPrompt?: string;
    reloadedMessageId?: string;
  } = await req.json();

  let autoModelCalculated: AutoModelCalculated | null = null;
  let chatModelConfiguration: ModelConfiguration | null = null;

  if (selectedModel === "Auto") {
    const firstMessage = messages[0];

    autoModelCalculated = await autoModel(
      firstMessage?.content || messagePartsToText(firstMessage)
    );
    chatModelConfiguration = autoModelCalculated.modelConfig;
  } else {
    chatModelConfiguration =
      chatModelConfigurations[selectedModel] ||
      chatModelConfigurations["Llama 4 Maverick"];
  }

  return createDataStreamResponse({
    execute: (dataStream) => {
      const result = streamText({
        ...chatModelConfiguration,
        system: systemPrompt || defaultSystemPrompt,
        messages,
        temperature: autoModelCalculated
          ? autoModelCalculated.temperature
          : temperature,
        topP: autoModelCalculated ? undefined : topP,
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
