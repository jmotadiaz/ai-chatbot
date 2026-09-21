"use server";

import "server-only";

import { defaultWebSearchNumResults } from "@/lib/features/foundation-model/config";
import { type ChatbotMessage, type ChatMode } from "@/lib/features/chat/types";
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
  chatMode = "auto",

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
  chatMode?: ChatMode;

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
    chatMode,
    webSearchNumResults,
    ragMaxResources,
    minRagResourcesScore,
    user,
  });
}
