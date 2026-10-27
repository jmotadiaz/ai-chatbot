import { createUIMessageStreamResponse } from "ai";
import { newRequestId, runWithTraceContext } from "tracing";
import { config } from "config";
import { validate } from "uuid";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { defaultWebSearchNumResults } from "@/lib/features/foundation-model/config";
import type { ChatbotMessage, ChatMode } from "@/lib/features/chat/types";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { processChatResponse } from "@/lib/features/chat/handlers";
import { register } from "@/lib/features/chat/resume/registry";
import { createRegistrySseConsumer } from "@/lib/features/chat/resume/consume-sse";

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
    streamKey,

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
    streamKey?: string;

    webSearchNumResults?: number;
    ragMaxResources?: number;
    minRagResourcesScore?: number;
  } = await req.json();

  const runId = config.traceRunId() ?? "default";
  const requestId = newRequestId();

  // A valid `streamKey` (client-generated uuid per turn) opts this turn into
  // the in-memory resume registry: the SSE tee below keeps generation and
  // `onFinish` persistence alive across a client disconnect. Absent or
  // invalid keys, and `preventChatPersistence` turns (hub/temporary/
  // project-form), keep today's behavior exactly: no registration, no tee,
  // zero registry memory.
  const resumableStreamKey =
    !preventChatPersistence && streamKey && validate(streamKey)
      ? streamKey
      : undefined;

  if (resumableStreamKey) {
    register(resumableStreamKey, { chatId });
  }

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
        streamKey: resumableStreamKey,

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
    // Fire-and-forget tee into the resume registry (only for registered
    // turns): the SDK never awaits this callback, and the consumer swallows
    // its own errors and always closes the entry (see `consume-sse.ts`).
    ...(resumableStreamKey && {
      consumeSseStream: createRegistrySseConsumer(resumableStreamKey),
    }),
  });
});
