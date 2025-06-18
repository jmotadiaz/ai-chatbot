import { saveChat, saveMessages, transaction } from "@/lib/db/queries";
import { UIMessage } from "ai";
import { auth } from "@/auth";
import { chatModelId } from "@/lib/ai/providers";
import {
  generateTitleFromUserMessage,
  messageToDbMessage,
} from "@/lib/ai/utils";
import { revalidatePath } from "next/cache";

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
    selectedModel: chatModelId;
    projectId?: string;
    chatId: string;
    temperature: number;
    topP: number;
  } = await req.json();

  try {
    await transaction([
      saveChat({
        userId: session.user.id,
        id: chatId,
        projectId,
        defaultModel: selectedModel,
        defaultTemperature: temperature,
        defaultTopP: topP,
        title: await generateTitleFromUserMessage(messages[0]),
      }),
      saveMessages(messages.map(messageToDbMessage(chatId))),
    ]);
    revalidatePath("/");
    return new Response("Chat Saved", { status: 200 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("Error saving chat", error);
    return new Response(error?.message || "Error saving Chat", { status: 500 });
  }
}
