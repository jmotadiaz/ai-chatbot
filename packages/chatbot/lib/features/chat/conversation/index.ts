import { makeProcessChatResponse } from "./factory";
import { compactionAiAdapter } from "@/lib/features/compaction";
import { isTestMode } from "@/lib/infrastructure/env";
import {
  createDeterministicChatModeRouter,
  stubChatModeRouter,
} from "@/lib/features/chat/mode-routing";

// Ticket 04 replaces `stubChatModeRouter` with the real Jev/OpenRouter adapter.
// Under e2e/dev-test the deterministic router keeps Auto network-free.
export const processChatResponse = makeProcessChatResponse(
  compactionAiAdapter,
  isTestMode() ? createDeterministicChatModeRouter() : stubChatModeRouter,
);

export * from "./ports";
