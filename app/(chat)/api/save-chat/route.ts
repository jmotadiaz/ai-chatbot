import { saveChat, saveMessages } from "@/lib/db/queries";
import { modelID, titleModel } from "../../providers";
import { generateText, UIMessage } from "ai";
import { auth } from "@/auth";

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const {
    chatId,
    messages,
    selectedModel,
  }: {
    messages: UIMessage[];
    selectedModel: modelID;
    chatId: string;
  } = await req.json();

  try {
    await saveChat({
      userId: session.user.id,
      id: chatId,
      defaultModel: selectedModel,
      title: await generateTitleFromUserMessage(messages[0]),
    });

    await saveMessages({
      messages: messages.map((message) => ({
        chatId,
        id: message.id,
        role: message.role,
        parts: message.parts,
        attachments: message.experimental_attachments ?? [],
        createdAt: new Date(),
      })),
    });
    return new Response("Chat Saved", { status: 200 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("Error saving chat", error);
    return new Response(error?.message || "Error saving Chat", { status: 500 });
  }
}

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
