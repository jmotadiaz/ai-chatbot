import {
  streamText,
  UIMessage,
  smoothStream,
  convertToModelMessages,
  stepCountIs,
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
} from "@/lib/ai/rag/retrieve";
import { webSearch } from "@/lib/ai/tools/web-search";

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
    messages: UIMessage[];
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
  let retrieveResult: RetrieveResult | null = null;

  console.log(selectedModel, useRAG, useWebSearch);

  if (selectedModel === "Auto Model Workflow") {
    const firstMessage = messages[0];

    chatModelConfiguration = autoModel(
      firstMessage ? messagePartsToText(firstMessage) : ""
    );
  } else {
    chatModelConfiguration = Promise.resolve({
      ...(chatModelConfigurations[selectedModel] ||
        chatModelConfigurations["Llama 4 Scout"]),
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
        userMessages.reduce(
          (concatenatedMessage, msg) => `
          ${concatenatedMessage}
          ${messagePartsToText(msg)}
      `,
          ""
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

  const modelConfig = await chatModelConfiguration;

  const result = streamText({
    ...modelConfig,
    system: enhancedSystemPrompt,
    messages: convertToModelMessages(messages),
    tools: { webSearch },
    experimental_transform: smoothStream({ chunking: "word" }),
    stopWhen: stepCountIs(3),
    prepareStep: async ({ stepNumber }) => {
      if (useWebSearch && stepNumber === 0) {
        // If using web search, we can prepare the step here
        return {
          toolChoice: { type: "tool", toolName: "webSearch" },
        };
      }
    },
    experimental_telemetry: {
      isEnabled: true,
    },
    onChunk() {
      // Sources and other data are handled automatically in v5
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
                        id: generateUUID(),
                        role: "assistant",
                        parts: assistantMessage.content,
                      } as UIMessage),
                    ]),
                  ]
                : [
                    saveMessages(
                      [
                        userMessage,
                        {
                          id: generateUUID(),
                          role: "assistant",
                          parts: assistantMessage.content,
                        } as UIMessage,
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

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: true,
    sendSources: true,
    generateMessageId: generateUUID,
    onFinish() {
      // Handle any final processing here if needed
    },
  });
}
