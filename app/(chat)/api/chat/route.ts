import { model, modelID } from "@/lib/ai/providers";
import {
  streamText,
  UIMessage,
  smoothStream,
  appendResponseMessages,
} from "ai";
import { generateUUID } from "@/lib/utils";
import { saveMessages } from "@/lib/db/queries";
import { auth } from "@/auth";

// Allow streaming responses up to 30 seconds
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
  }: {
    messages: UIMessage[];
    selectedModel: modelID;
    temperature?: number;
    topP?: number;
    chatId?: string;
  } = await req.json();

  const result = streamText({
    model: model.languageModel(selectedModel),
    system: `You are a helpful assistant.
Respond to the user in Markdown format.
When writing code, specify the language in the backticks, e.g. \`\`\`javascript\`code here\`\`\`.
The default language is javascript.
Avoid repeating information previously stated in the conversation and keep your answers concise.`,
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
            saveMessages({
              messages: [
                {
                  chatId,
                  id: userMessage.id,
                  role: userMessage.role,
                  parts: userMessage.parts,
                  attachments: userMessage.experimental_attachments ?? [],
                  createdAt: new Date(),
                },
                {
                  chatId,
                  id: assistantMessage.id,
                  role: assistantMessage.role,
                  parts: assistantMessage.parts,
                  attachments: assistantMessage.experimental_attachments ?? [],
                  createdAt: new Date(),
                },
              ],
            });
          }
        } catch (error) {
          console.error("Error saving message:", error);
        }
      }
    },
  });

  return result.toDataStreamResponse({
    sendReasoning: true,
    getErrorMessage: (error) => {
      if (error instanceof Error) {
        if (error.message.includes("Rate limit")) {
          return "Rate limit exceeded. Please try again later.";
        }
      }
      console.error(error);
      return "An error occurred.";
    },
  });
}
