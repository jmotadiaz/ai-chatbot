import { config } from "config";
import { makeProcessChatResponse } from "./factory";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import {
  createChatModeRouter,
  createDeterministicChatModeRouter,
} from "@/lib/features/chat/mode-routing";

// The real classifier is Jev 1.13 through the OpenRouter Decisions API,
// reached via the kit's generic `decide` (see `inference`). In the Test
// Environment the deterministic router keeps Auto offline: the Environment is
// decided by `config.environment()` (static bundle welded at compile time —
// replacing the old `isTestMode()`/`NEXT_PUBLIC_ENV`, ADR 0011).
export const processChatResponse = makeProcessChatResponse(
  config.environment() === "test"
    ? createDeterministicChatModeRouter()
    : createChatModeRouter(inferenceKit.decide),
);

export * from "./ports";
