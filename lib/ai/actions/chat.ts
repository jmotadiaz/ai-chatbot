"use server";

import { revalidatePath } from "next/cache";
import {
  deleteChat as deleteDBChat,
  saveChat as saveDBChat,
  saveMessages,
  transaction,
} from "@/lib/db/queries";
import { auth } from "@/auth";
import { chatModelId } from "@/lib/ai/models/definition";
import {
  generateTitleFromUserMessage,
  chatbotMessageToDbMessage,
} from "@/lib/ai/utils";
import { ChatbotMessage } from "@/lib/ai/types";

export async function saveChat(req: {
  messages: ChatbotMessage[];
  selectedModel: chatModelId;
  projectId?: string;
  chatId: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  tools?: string[];
}) {
  const session = await auth();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const {
    projectId,
    chatId,
    messages,
    selectedModel,
    temperature,
    topP,
    topK,
    tools,
  } = req;

  try {
    await transaction(
      saveDBChat({
        userId: session.user.id,
        id: chatId,
        projectId,
        defaultModel: selectedModel,
        defaultTemperature: temperature,
        defaultTopP: topP,
        defaultTopK: topK,
        tools,
        title: await generateTitleFromUserMessage(messages[0]),
      }),
      saveMessages(messages.map(chatbotMessageToDbMessage(chatId)))
    );
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
