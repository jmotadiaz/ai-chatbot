"use server";

import "server-only";

import { defaultWebSearchNumResults } from "@/lib/features/foundation-model/config";
import { type ChatbotMessage, type Agent } from "@/lib/features/chat/types";
import { type chatModelId } from "@/lib/features/foundation-model/config";
import { chatDbAdapter } from "@/lib/features/chat/conversation/adapters/db-adapter";
import { chatProjectAdapter } from "@/lib/features/chat/conversation/adapters/project-adapter";
import { makeProcessChatResponse } from "@/lib/features/chat/conversation";

export async function processChatResponse({
  messages,
  selectedModel,
  temperature,
  topP,
  topK,
  chatId,
  systemPrompt,
  messageId,
  projectId,
  preventChatPersistence = false,
  agent = "rag",

  webSearchNumResults = defaultWebSearchNumResults,
  ragMaxResources,
  minRagResourcesScore,
  user,
}: {
  messages: ChatbotMessage[];
  selectedModel: chatModelId;
  temperature?: number;
  topP?: number;
  topK?: number;
  chatId?: string;
  systemPrompt?: string;
  messageId?: string;
  projectId?: string;
  preventChatPersistence?: boolean;
  agent?: Agent;

  webSearchNumResults?: number;
  ragMaxResources?: number;
  minRagResourcesScore?: number;
  user: { id: string };
}) {
  const handler = makeProcessChatResponse(chatDbAdapter, chatProjectAdapter);
  return handler({
    messages,
    selectedModel,
    temperature,
    topP,
    topK,
    chatId,
    systemPrompt,
    messageId,
    projectId,
    preventChatPersistence,
    agent,
    webSearchNumResults,
    ragMaxResources,
    minRagResourcesScore,
    user,
  });
}
