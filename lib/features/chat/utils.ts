import type {
  FileUIPart,
  ReasoningUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  TextUIPart,
} from "ai";
import { generateText } from "ai";
import { put } from "@vercel/blob";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";
import type { InsertMessage, Message } from "@/lib/infrastructure/db/schema";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { RagChunk } from "@/lib/features/rag/types";
import { Tool, TOOLS } from "@/lib/features/chat/types";

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

const isBase64URI = (str: string) => {
  return /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+)?;base64,/.test(str);
};

const convertBase64ToBlob = (base64URI: string, mimetype: string): Blob => {
  let base64Data = base64URI;
  const prefix = `data:${mimetype};base64,`;

  if (base64URI.startsWith(prefix)) {
    base64Data = base64URI.substring(prefix.length);
  }

  const byteString = atob(base64Data);

  const byteArray = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    byteArray[i] = byteString.charCodeAt(i);
  }

  return new Blob([byteArray], { type: mimetype });
};

const buildBlobPart = async (part: FileUIPart): Promise<FileUIPart> => {
  if (!isBase64URI(part.url)) return part;
  const blob = await put(
    part.filename || "Unknown",
    convertBase64ToBlob(part.url, part.mediaType),
    {
      access: "public",
      addRandomSuffix: true,
    }
  );

  return {
    ...part,
    url: blob.url,
  };
};

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
      parts: await Promise.all(
        parts.map(async (part) =>
          part.type === "file" ? await buildBlobPart(part) : part
        )
      ),
      metadata,
    };
  };

export function dbMessageToChatbotMessage(
  messages: Array<Message>
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

export interface SegregatedMessagePartsReturn {
  reasoningParts: ReasoningUIPart[];
  textParts: TextUIPart[];
  fileParts: FileUIPart[];
  sourceParts: Array<SourceUrlUIPart | SourceDocumentUIPart>;
}

const ragChunksToSourceParts = (
  chunks: RagChunk[] = [],
  toolCallId: string
): Array<SourceUrlUIPart | SourceDocumentUIPart> => {
  const uniqueChunks = new Map<string, RagChunk>();
  for (const chunk of chunks) {
    uniqueChunks.set(chunk.resourceUrl || chunk.resourceTitle, chunk);
  }

  return Array.from(uniqueChunks.values()).map((chunk, idx) => {
    return {
      sourceId: `rag-source-${toolCallId}-${idx}`,
      title: chunk.resourceTitle,
      ...(chunk.resourceUrl
        ? { type: "source-url", url: chunk.resourceUrl }
        : {
            type: "source-document",
            mediaType: "text/plain",
          }),
    };
  });
};

export const destructuringMessageParts = (
  message: ChatbotMessage
): {
  reasoningParts: ReasoningUIPart[];
  textParts: TextUIPart[];
  fileParts: FileUIPart[];
  sourceParts: Array<SourceUrlUIPart | SourceDocumentUIPart>;
} => {
  return message.parts?.reduce<SegregatedMessagePartsReturn>(
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
          acc.sourceParts.push(
            ...ragChunksToSourceParts(part.output, part.toolCallId)
          );
          break;
      }
      return acc;
    },
    {
      reasoningParts: [],
      textParts: [],
      sourceParts: [],
      fileParts: [],
    }
  );
};

export const mergeReasoningParts = (
  parts: ReasoningUIPart[]
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
