import { generateText, Message, UIMessage } from "ai";
import { titleModelConfiguration } from "@/lib/ai/providers";
import { InsertMessage } from "@/lib/db/schema";

export async function generateTitleFromUserMessage(
  message: UIMessage | undefined
) {
  if (!message) return "Unknown";

  const { text: title } = await generateText({
    ...titleModelConfiguration["Llama 3.1 Instant"],
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
  (message: Message): InsertMessage => ({
    chatId,
    id: message.id,
    role: message.role,
    parts: message.parts,
    attachments: message.experimental_attachments ?? [],
  });

export const messagePartsToText = (message: UIMessage): string => {
  return message.parts?.reduce((content, part) => {
    if (part.type === "text") {
      return `${content}${part.text}`;
    }
    return content;
  }, "");
};
