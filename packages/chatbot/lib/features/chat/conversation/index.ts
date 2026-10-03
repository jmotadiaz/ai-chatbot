import { makeProcessChatResponse } from "./factory";
import { compactionAiAdapter } from "@/lib/features/compaction";
import { isTestMode } from "@/lib/infrastructure/env";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import {
  createChatModeRouter,
  createDeterministicChatModeRouter,
} from "@/lib/features/chat/mode-routing";

// The real classifier is Jev 1.13 through the OpenRouter Decisions API,
// reached via the kit's generic `decide` (see `inference`). Under test/e2e
// the deterministic router keeps Auto network-free (vitest does not set
// NEXT_PUBLIC_ENV, so unit/integration tests inject their own port).
export const processChatResponse = makeProcessChatResponse(
  compactionAiAdapter,
  isTestMode()
    ? createDeterministicChatModeRouter()
    : createChatModeRouter(inferenceKit.decide),
);

export * from "./ports";
