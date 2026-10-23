import type {
  FileUIPart,
  ReasoningUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  TextUIPart,
  ToolUIPart,
} from "ai";
import type { InsertMessage, Message } from "@/lib/infrastructure/db/schema";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { RagChunk } from "@/lib/features/rag/types";
import { Tool, TOOLS } from "@/lib/features/chat/types";

export const chatbotMessageToDbMessage =
  (chatId: string) =>
  async ({
    id,
    role,
    parts,
    metadata,
  }: ChatbotMessage): Promise<InsertMessage> => {
    return {
      chatId,
      id,
      role,
      // Attachments are data-URLs owned by the client: persist them as-is.
      parts,
      metadata,
    };
  };

export function dbMessageToChatbotMessage(
  messages: Array<Message>,
): Array<ChatbotMessage> {
  return messages.map((message) => ({
    id: message.id,
    parts: message.parts as ChatbotMessage["parts"],
    role: message.role as ChatbotMessage["role"],
    metadata: message.metadata as ChatbotMessage["metadata"],
    createdAt: message.createdAt,
  }));
}

export const messagePartsToText = (message: ChatbotMessage): string => {
  return message.parts?.reduce((content, part) => {
    if (part.type === "text") {
      return `${content}${part.text}`;
    }
    return content;
  }, "");
};

export interface DestructuringMessagePartsReturn {
  reasoningParts: ReasoningUIPart[];
  textParts: TextUIPart[];
  fileParts: FileUIPart[];
  sourceParts: Array<SourceUrlUIPart | SourceDocumentUIPart>;
  toolParts: Array<ToolUIPart>;
  context7Parts: { libraryId: string; output: string }[];
  ragSourceParts: RagChunk[][];
}

const webResultToSourceParts = (
  results: Array<{ title: string; url: string }> = [],
  toolCallId: string,
  prefix: string,
): Array<SourceUrlUIPart | SourceDocumentUIPart> => {
  return results.map((result, idx) => {
    return {
      type: "source-url",
      sourceId: `${prefix}-${toolCallId}-${idx}`,
      title: result.title || result.url,
      url: result.url,
    };
  });
};

export const destructuringMessageParts = (
  message: ChatbotMessage,
): DestructuringMessagePartsReturn => {
  return message.parts?.reduce<DestructuringMessagePartsReturn>(
    (acc, part) => {
      switch (part.type) {
        case "reasoning":
          acc.reasoningParts.push(part);
          break;
        case "text":
          acc.textParts.push(part);
          break;
        case "source-url":
        case "source-document":
          acc.sourceParts.push(part);
          break;
        case "file":
          acc.fileParts.push(part);
          break;
        case "tool-rag":
          // Separate RAG sources to be handled by specific UI
          if (part.output) {
            acc.ragSourceParts.push(part.output);
          }
          acc.toolParts.push(part);
          break;
        case "tool-webSearch":
          acc.sourceParts.push(
            ...webResultToSourceParts(
              part.output,
              part.toolCallId,
              "web-search",
            ),
          );
          acc.toolParts.push(part);
          break;
        case "tool-urlContext":
          acc.sourceParts.push(
            ...webResultToSourceParts(
              part.output,
              part.toolCallId,
              "url-context",
            ),
          );
          acc.toolParts.push(part);
          break;
        case "tool-queryDocs":
          if (
            "input" in part &&
            part.input &&
            "libraryId" in part.input &&
            typeof part.input.libraryId === "string" &&
            part.output
          ) {
            acc.context7Parts.push({
              libraryId: part.input.libraryId,
              output: part.output,
            });
          }
          acc.toolParts.push(part);
          break;

        case "tool-resolveLibraryId":
          acc.toolParts.push(part);
          break;
      }
      return acc;
    },
    {
      reasoningParts: [],
      textParts: [],
      sourceParts: [],
      toolParts: [],
      fileParts: [],
      ragSourceParts: [],
      context7Parts: [],
    },
  );
};

export const mergeReasoningParts = (
  parts: ReasoningUIPart[],
): ReasoningUIPart | null => {
  if (parts.length === 0) return null;

  const lastPart = parts[parts.length - 1];
  return {
    type: "reasoning",
    text: parts.map((p) => p.text).join(""),
    state: lastPart.state,
    providerMetadata: lastPart.providerMetadata,
  };
};

export const filterTools = (tools: string[]): Tool[] => {
  return tools.filter((tool): tool is Tool => TOOLS.includes(tool as Tool));
};
