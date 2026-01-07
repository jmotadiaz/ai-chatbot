import { createUIMessageStreamResponse } from "ai";
import { defaultSystemPrompt } from "@/lib/features/chat/prompts";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { WEB_SEARCH_TOOL } from "@/lib/features/web-search/constants";
import {
  defaultRagMaxResources,
  defaultWebSearchNumResults,
} from "@/lib/features/foundation-model/config";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { processChatResponse } from "@/lib/features/chat/actions";

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
    topP?: number;
    topK?: number;
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
    topP,
    topK,
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
