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
  deleteMessageById,
  saveMessages,
  transaction,
  updateChat,
} from "@/lib/db/queries";
import { auth } from "@/auth";
import { messagePartsToText, messageToDbMessage } from "@/lib/ai/utils";
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
    tools: selectedTools = [],
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
      let reasoning = false;

      const result = streamText({
        ...modelConfiguration,
        system: systemPrompt || defaultSystemPrompt,
        messages: convertToModelMessages(messages),
        tools: toolSet,
        stopWhen: stepCountIs(4),
        activeTools: [],
        experimental_transform: smoothStream(),
        experimental_telemetry: { isEnabled: true },
        prepareStep: async () => {
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
        onChunk: ({ chunk }) => {
          if (chunk.type === "reasoning-delta" && !reasoning) {
            console.log("Reasoning started");
            writer.write({
              type: "data-reasoning",
              data: {
                status: "started",
              },
            });
            reasoning = true;
          }
          if (chunk.type !== "reasoning-delta" && reasoning) {
            console.log("Reasoning finished");
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
                        defaultTopK: topK,
                        tools,
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
