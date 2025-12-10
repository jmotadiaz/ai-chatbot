import { createUIMessageStreamResponse } from "ai";
import { defaultSystemPrompt } from "@/lib/ai/prompts";
import type { chatModelId } from "@/lib/ai/models/definition";
import { RAG_TOOL, WEB_SEARCH_TOOL } from "@/lib/ai/tools/types";
import {
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/ai/models/definition";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { withAuth } from "@/lib/auth/handlers";
import { processChatResponse } from "@/lib/features/chat/actions";

export const maxDuration = 240;

export const POST = withAuth(async (user, req) => {
  const {
    messages,
    selectedModel,
    temperature,
    chatId,
    systemPrompt = defaultSystemPrompt,
    tools: selectedTools = [],
    messageId,
    projectId,
    preventChatPersistence = false,
    ragMaxResources = defaultRagMaxResources,
    webSearchNumResults = defaultWebSearchNumResults,
  }: {
    messages: ChatbotMessage[];
    selectedModel: chatModelId;
    temperature?: number;
    chatId?: string;
    systemPrompt?: string;
    tools?: Array<typeof RAG_TOOL | typeof WEB_SEARCH_TOOL>;
    messageId?: string;
    projectId?: string;
    preventChatPersistence?: boolean;
    ragMaxResources?: number;
    webSearchNumResults?: number;
  } = await req.json();

  const stream = await processChatResponse({
    messages,
    selectedModel,
    temperature,
    chatId,
    systemPrompt,
    selectedTools,
    messageId,
    projectId,
    preventChatPersistence,
    ragMaxResources,
    webSearchNumResults,
    user: { id: user.id },
  });

  return createUIMessageStreamResponse({ stream });
});
