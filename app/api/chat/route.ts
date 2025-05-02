import { model, modelID } from "@/ai/providers";
import { streamText, UIMessage, smoothStream } from "ai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const {
    messages,
    selectedModel,
  }: { messages: UIMessage[]; selectedModel: modelID } = await req.json();

  const result = streamText({
    model: model.languageModel(selectedModel),
    system:
      "You are a helpful assistant. Respond to the user in Markdown format. When writing code, specify the language in the backticks, e.g. ```javascript`code here```. The default language is javascript",
    messages,
    experimental_transform: smoothStream({ chunking: "word" }),
    experimental_telemetry: {
      isEnabled: true,
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
