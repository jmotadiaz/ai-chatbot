import { createUIMessageStreamResponse } from "ai";
import { defaultSystemPrompt } from "@/lib/features/chat/prompts";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { defaultWebSearchNumResults } from "@/lib/features/foundation-model/config";
import type { ChatbotMessage, Agent } from "@/lib/features/chat/types";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { processChatResponse } from "@/lib/features/chat/handlers";

export const maxDuration = 240;

export const POST = withAuth(async (user, req) => {
  const {
    messages,
    selectedModel,
    temperature,
    topP,
    topK,
    chatId,
    systemPrompt = defaultSystemPrompt,
    agent,
    messageId,
    projectId,
    preventChatPersistence = false,

    webSearchNumResults = defaultWebSearchNumResults,
    ragMaxResources,
    minRagResourcesScore,
  }: {
    messages: ChatbotMessage[];
    selectedModel: chatModelId;
    temperature?: number;
    topP?: number;
    topK?: number;
    chatId?: string;
    systemPrompt?: string;
    agent?: Agent;
    messageId?: string;
    projectId?: string;
    preventChatPersistence?: boolean;

    webSearchNumResults?: number;
    ragMaxResources?: number;
    minRagResourcesScore?: number;
  } = await req.json();

  const stream = await processChatResponse({
    messages,
    selectedModel,
    temperature,
    topP,
    topK,
    chatId,
    systemPrompt,
    agent,
    messageId,
    projectId,
    preventChatPersistence,

    webSearchNumResults,
    ragMaxResources,
    minRagResourcesScore,
    user: { id: user.id },
  });

  return createUIMessageStreamResponse({ stream });
});
