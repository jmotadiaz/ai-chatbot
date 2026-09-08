import "server-only";

import type { TextUIPart } from "ai";
import { generateText } from "ai";
import { languageModelConfigurations } from "@/lib/features/foundation-model/server";
import type { ChatbotMessage } from "@/lib/features/chat/types";

const filterTextParts = (parts: ChatbotMessage["parts"] = []) => {
  return parts.filter((part) => part.type === "text") as TextUIPart[];
};

export async function generateTitle(messages: ChatbotMessage[]) {
  const userMessage = messages.find(({ role }) => role === "user");
  const assistantMessage = messages.find(({ role }) => role === "assistant");

  if (!userMessage && !assistantMessage) return "Unknown";

  const parts = [
    ...filterTextParts(userMessage?.parts),
    ...filterTextParts(assistantMessage?.parts),
  ];

  try {
    const { text: title } = await generateText({
      ...languageModelConfigurations("Llama 3.1 Instant"),
      system: `\n
      You are a chat title generator. Create a concise title (≤60 characters) summarizing the first user message. Follow these rules:
      1. Extract the core topic from the user's message
      2. Use only essential keywords (no filler words)
      3. Never include:
        - Markdown formatting
        - Prefixes/suffixes (e.g., "Title:")
        - Quotation marks
        - Unrelated content
      4. Strictly output only the generated title

      Example:
      User message: "Can you help debug my Python script? It's throwing index errors"
      Output: Python script debugging help`,
      prompt: JSON.stringify(parts),
    });

    return title;
  } catch (error) {
    console.error("Error generating title:", error);

    return "Unknown";
  }
}
