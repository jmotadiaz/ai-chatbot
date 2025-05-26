import { generateText, UIMessage } from "ai";
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
