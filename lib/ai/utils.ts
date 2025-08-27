import { FileUIPart, GenerateObjectResult, generateText } from "ai";
import { languageModelConfigurations } from "@/lib/ai/models/definition";
import { InsertMessage, Message } from "@/lib/db/schema";
import { ChatbotMessage } from "@/lib/ai/types";

export async function generateTitleFromUserMessage(
  message: ChatbotMessage | undefined
) {
  if (!message) return "Unknown";

  const { text: title } = await generateText({
    ...languageModelConfigurations["Llama 3.1 Instant"],
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 60 characters long
    - the title should be a summary of the user's message, and should only include the summary
    - do not use markdown formatting, it should be plain text`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export const chatbotMessageToDbMessage =
  (chatId: string) =>
  ({ id, role, parts, metadata }: ChatbotMessage): InsertMessage => ({
    chatId,
    id,
    role,
    parts: parts.filter((part) => part.type !== "file"),
    metadata,
    attachments: [], // In v5, attachments are handled through parts
  });

export function dbMessageToChatbotMessage(
  messages: Array<Message>
): Array<ChatbotMessage> {
  return messages.map((message) => ({
    id: message.id,
    parts: message.parts as ChatbotMessage["parts"],
    role: message.role as ChatbotMessage["role"],
    metadata: message.metadata as ChatbotMessage["metadata"],
    createdAt: message.createdAt,
    // In v5, attachments are handled through parts array
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

export const getObject = <T>({ object }: GenerateObjectResult<T>) => object;

export const once = <T>(fn: () => T): (() => T) => {
  let called = false;
  let result: T;

  return () => {
    if (!called) {
      called = true;
      result = fn();
    }
    return result;
  };
};

export type FilePart = Pick<
  FileUIPart,
  "type" | "mediaType" | "url" | "filename"
>;

export const convertFilesToDataURLs = async (
  files: FileList
): Promise<FilePart[]> => {
  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<FilePart>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              type: "file",
              mediaType: file.type,
              filename: file.name,
              url: reader.result as string,
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    )
  );
};
