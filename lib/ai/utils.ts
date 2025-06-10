import { generateText, Message, UIMessage } from "ai";
import { Message as DBMessage } from "@/lib/db/schema";
import { titleModel } from "./providers";

export async function generateTitleFromUserMessage(
  message: UIMessage | undefined
) {
  if (!message) return "Unknown";

  const { text: title } = await generateText({
    model: titleModel,
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
  (message: Message): Omit<DBMessage, "createdAt"> => {
    return {
      chatId,
      id: message.id,
      role: message.role,
      parts: message.parts,
      attachments: message.experimental_attachments ?? [],
    };
  };
