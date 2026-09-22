import { createUIMessageStreamResponse } from "ai";
import { newRequestId, runWithTraceContext } from "tracing";
import { config } from "config";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { defaultWebSearchNumResults } from "@/lib/features/foundation-model/config";
import type { ChatbotMessage, ChatMode } from "@/lib/features/chat/types";
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
    systemPrompt,
    chatMode,
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
    chatMode?: ChatMode;
    messageId?: string;
    projectId?: string;
    preventChatPersistence?: boolean;

    webSearchNumResults?: number;
    ragMaxResources?: number;
    minRagResourcesScore?: number;
  } = await req.json();

  const runId = config.traceRunId() ?? "default";
  const requestId = newRequestId();

  const stream = await runWithTraceContext(
    {
      runId,
      requestId,
      stepIndex: 0,
      chatId,
      userId: user.id,
      agent: chatMode,
      modelKey: selectedModel,
    },
    () =>
      processChatResponse({
        messages,
        selectedModel,
        temperature,
        topP,
        topK,
        chatId,
        systemPrompt,
        chatMode,
        messageId,
        projectId,
        preventChatPersistence,

        webSearchNumResults,
        ragMaxResources,
        minRagResourcesScore,
        user: { id: user.id },
      }),
  );

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "X-Trace-Run-Id": runId,
      "X-Trace-Request-Id": requestId,
    },
  });
});
