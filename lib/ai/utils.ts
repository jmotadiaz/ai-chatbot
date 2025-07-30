import { GenerateObjectResult, generateText } from "ai";
import { languageModelConfigurations } from "@/lib/ai/models";
import { InsertMessage } from "@/lib/db/schema";
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
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export const messageToDbMessage =
  (chatId: string) =>
  (message: ChatbotMessage): InsertMessage => ({
    chatId,
    id: message.id,
    role: message.role,
    parts: message.parts,
    attachments: [], // In v5, attachments are handled through parts
  });

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
