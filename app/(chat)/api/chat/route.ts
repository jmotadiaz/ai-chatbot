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
  WEB_SEARCH_TOOL,
  URL_CONTEXT_TOOL,
  RAG_TOOL,
} from "@/lib/ai/tools/constants";
import {
  hasContextUrls,
  urlContextFactory,
  webSearchFactory,
} from "@/lib/ai/tools/web-search";
import { ragFactory } from "@/lib/ai/tools/rag";
import { ChatbotMessage } from "@/lib/ai/types";
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
    tools = [],
    messageId,
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
  } = await req.json();

  const stream = createUIMessageStream<ChatbotMessage>({
    async execute({ writer }) {
      const toolSet: ToolSet = {
        ...webSearchFactory({ writer }),
        ...ragFactory({ writer }),
        ...urlContextFactory({ writer }),
      };
      const executedTools = new Set<keyof typeof toolSet>();
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
        tools: toolSet,
        stopWhen: stepCountIs(4),
        activeTools: [],
        experimental_transform: smoothStream(),
        experimental_telemetry: { isEnabled: true },
        prepareStep: async ({ model }) => {
          const provider =
            typeof model === "string" ? "unknown" : model.provider;
          const lastMessage = messagePartsToText(messages[messages.length - 1]);

          if (tools.includes(RAG_TOOL) && !executedTools.has(RAG_TOOL)) {
            executedTools.add(RAG_TOOL);
            return {
              ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
              toolChoice: { type: "tool", toolName: RAG_TOOL },
              activeTools: [RAG_TOOL],
            };
          }

          if (
            provider !== "perplexity" &&
            !executedTools.has(URL_CONTEXT_TOOL) &&
            hasUrls(lastMessage) &&
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
            provider !== "perplexity" &&
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
              case "text-start":
                return { status: "streaming" };
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
                  await transaction(
                    updateChat(
                      { id: chatId, userId: session.user.id },
                      {
                        defaultModel: selectedModel,
                        defaultTemperature: temperature,
                        defaultTopP: topP,
                      }
                    ),
                    deleteMessageById(messageId),
                    saveMessages(
                      [userMessage, assistantMessage].map(
                        messageToDbMessage(chatId)
                      )
                    )
                  );
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
