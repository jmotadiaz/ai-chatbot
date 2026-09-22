import { makeProcessChatResponse } from "./factory";
import { compactionAiAdapter } from "@/lib/features/compaction";
import { isTestMode } from "@/lib/infrastructure/env";
import {
  createDeterministicChatModeRouter,
  createOpenRouterChatModeRouter,
} from "@/lib/features/chat/mode-routing";

// The real classifier is Jev 1.13 through the OpenRouter Decisions API. Under
// test/e2e the deterministic router keeps Auto network-free (vitest does not
// set NEXT_PUBLIC_ENV, so unit/integration tests inject their own port).
export const processChatResponse = makeProcessChatResponse(
  compactionAiAdapter,
  isTestMode() ? createDeterministicChatModeRouter() : createOpenRouterChatModeRouter(),
);

export * from "./ports";
