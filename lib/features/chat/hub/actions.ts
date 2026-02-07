"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/features/auth/cached-auth";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import type { ChatbotMessage, Tools, Agent } from "@/lib/features/chat/types";
import { saveChat, saveMessages } from "@/lib/features/chat/queries";
import {
  chatbotMessageToDbMessage,
  generateTitle,
} from "@/lib/features/chat/utils";
import { defaultWebSearchNumResults } from "@/lib/features/foundation-model/config";
import { getDb } from "@/lib/infrastructure/db/db";

export async function persistHubChatFromTranscript({
  chatId,
  messages,
  model,
  tools = [],
  agent,
  projectId,
  temperature,

  webSearchNumResults = defaultWebSearchNumResults,
}: {
  chatId: string;
  messages: ChatbotMessage[];
  model: chatModelId;
  tools?: Tools;
  agent?: Agent;
  projectId?: string;
  temperature?: number;

  webSearchNumResults?: number;
}): Promise<{ chatId: string }> {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const title = await generateTitle(messages);

  const persistedChatId = await getDb().transaction(async (tx) => {
    const chat = await saveChat({
      id: chatId,
      userId: session.user.id,
      title,
      projectId,
      defaultModel: model,
      defaultTemperature: temperature,

      webSearchNumResults,
      tools,
      agent,
    })(tx);

    await saveMessages(
      await Promise.all(messages.map(chatbotMessageToDbMessage(chat.id))),
    )(tx);

    return chat.id;
  });

  revalidatePath("/");
  revalidatePath("/chat/history");
  revalidatePath("/chat/hub");

  return { chatId: persistedChatId };
}
