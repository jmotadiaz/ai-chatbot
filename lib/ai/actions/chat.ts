"use server";

import { UIMessage } from "ai";
import { revalidatePath } from "next/cache";
import {
  deleteChat as deleteDBChat,
  saveChat as saveDBChat,
  saveMessages,
  transaction,
} from "@/lib/db/queries";
import { auth } from "@/auth";
import { chatModelId } from "@/lib/ai/models";
import {
  generateTitleFromUserMessage,
  messageToDbMessage,
} from "@/lib/ai/utils";

export async function saveChat(req: {
  messages: UIMessage[];
  selectedModel: chatModelId;
  projectId?: string;
  chatId: string;
  temperature: number;
  topP: number;
}) {
  const session = await auth();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const { projectId, chatId, messages, selectedModel, temperature, topP } = req;

  try {
    await transaction([
      saveDBChat({
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
  } catch (error: unknown) {
    console.error("Error saving chat", error);
    throw new Error(
      error instanceof Error ? error.message : "Error saving Chat"
    );
  }
}

export async function deleteChat(id: string) {
  const session = await auth();
  if (!session?.user) {
    return;
  }

  try {
    await transaction(deleteDBChat({ id, userId: session.user.id }));
    revalidatePath("/");
  } catch (error) {
    console.error("Failed to delete chat:", error);
  }
}
