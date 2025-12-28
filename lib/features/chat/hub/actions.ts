"use server";

import { auth } from "@/lib/features/auth/auth-config";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import type { ChatbotMessage, Tools } from "@/lib/features/chat/types";
import { saveChat, saveMessages } from "@/lib/features/chat/queries";
import { chatbotMessageToDbMessage, generateTitle } from "@/lib/features/chat/utils";
import {
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/constants";
import { getDb } from "@/lib/infrastructure/db/db";

export async function persistHubChatFromTranscript({
  messages,
  model,
  tools = [],
  projectId,
  temperature,
  ragMaxResources = defaultRagMaxResources,
  webSearchNumResults = defaultWebSearchNumResults,
}: {
  messages: ChatbotMessage[];
  model: chatModelId;
  tools?: Tools;
  projectId?: string;
  temperature?: number;
  ragMaxResources?: number;
  webSearchNumResults?: number;
}): Promise<{ chatId: string }> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const title = await generateTitle(messages);

  const chatId = await getDb().transaction(async (tx) => {
    const chat = await saveChat({
      userId: session.user.id,
      title,
      projectId,
      defaultModel: model,
      defaultTemperature: temperature,
      ragMaxResources,
      webSearchNumResults,
      tools,
    })(tx);

    await saveMessages(
      await Promise.all(messages.map(chatbotMessageToDbMessage(chat.id)))
    )(tx);

    return chat.id;
  });

  return { chatId };
}


