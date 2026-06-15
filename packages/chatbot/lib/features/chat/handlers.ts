"use server";

import "server-only";

import { defaultWebSearchNumResults } from "@/lib/features/foundation-model/config";
import { type ChatbotMessage, type Agent } from "@/lib/features/chat/types";
import { type chatModelId } from "@/lib/features/foundation-model/config";
import { processChatResponse as processChatResponseFn } from "@/lib/features/chat/conversation";

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
  agent = "context7",

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
  return processChatResponseFn({
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
