import type { ModelMessage } from "ai";
import type { ChatbotMessage } from "@/lib/features/chat/types";

const CHARS_PER_TOKEN = 4;
const FILE_CHARS_ESTIMATE = 4800;

export function extractTextContent(message: ChatbotMessage): string {
  return message.parts?.reduce((content, part) => {
    switch (part.type) {
      case "text":
        return content + part.text;
      case "reasoning":
        return content + part.text;
      case "tool-rag":
      case "tool-webSearch":
      case "tool-urlContext":
      case "tool-queryDocs":
      case "tool-resolveLibraryId":
        if (part.output && typeof part.output === "string") {
          return content + part.output;
        }
        return content;
      case "file":
        return content;
      default:
        return content;
    }
  }, "");
}

export function estimateTokens(message: ChatbotMessage): number {
  let totalChars = 0;

  if (!message.parts) return 0;

  for (const part of message.parts) {
    switch (part.type) {
      case "text":
        totalChars += part.text.length;
        break;
      case "reasoning":
        totalChars += part.text.length;
        break;
      case "tool-rag":
      case "tool-webSearch":
      case "tool-urlContext":
      case "tool-queryDocs":
      case "tool-resolveLibraryId":
        if (part.output && typeof part.output === "string") {
          totalChars += part.output.length;
        }
        break;
      case "file":
        totalChars += FILE_CHARS_ESTIMATE;
        break;
      case "source-url":
      case "source-document":
      case "step-start":
      case "dynamic-tool":
        break;
    }
  }

  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

export function estimateContextTokens(
  messages: ChatbotMessage[],
  providerUsage?: { inputTokens: number },
): number {
  if (providerUsage?.inputTokens) {
    const lastMessage = messages[messages.length - 1];
    const lastMessageTokens = lastMessage ? estimateTokens(lastMessage) : 0;
    return providerUsage.inputTokens - lastMessageTokens;
  }

  return messages.reduce((sum, msg) => sum + estimateTokens(msg), 0);
}

export function pruneChatMessages(messages: ChatbotMessage[]): ChatbotMessage[] {
  const result: ChatbotMessage[] = [];
  const lastIndex = messages.length - 1;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const parts = msg.parts ?? [];
    const isLast = i === lastIndex;

    const filteredParts = isLast
      ? parts
      : parts.filter((p) => p.type !== "reasoning");

    if (filteredParts.length === 0) continue;

    result.push({ ...msg, parts: filteredParts });
  }

  return result;
}

export function estimateModelMessagesTokens(messages: ModelMessage[]): number {
  let totalChars = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ("text" in part && typeof (part as { text: string }).text === "string") {
          totalChars += (part as { text: string }).text.length;
        }
      }
    }
  }
  return Math.ceil(totalChars / 4);
}
