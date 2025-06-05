import { saveChat, saveMessages } from "@/lib/db/queries";
import { UIMessage } from "ai";
import { auth } from "@/auth";
import { modelID } from "@/lib/ai/providers";
import { generateTitleFromUserMessage } from "@/lib/ai/utils";

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const {
    projectId,
    chatId,
    messages,
    selectedModel,
    temperature,
    topP,
  }: {
    messages: UIMessage[];
    selectedModel: modelID;
    projectId?: string;
    chatId: string;
    temperature: number;
    topP: number;
  } = await req.json();

  try {
    await saveChat({
      userId: session.user.id,
      id: chatId,
      projectId,
      defaultModel: selectedModel,
      defaultTemperature: temperature,
      defaultTopP: topP,
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
