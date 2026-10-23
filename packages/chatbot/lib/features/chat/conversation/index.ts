import { config } from "config";
import { makeProcessChatResponse } from "./factory";
import { compactionAiAdapter } from "@/lib/features/compaction";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import {
  createChatModeRouter,
  createDeterministicChatModeRouter,
} from "@/lib/features/chat/mode-routing";

// The real classifier is Jev 1.13 through the OpenRouter Decisions API,
// reached via the kit's generic `decide` (see `inference`). En el Entorno de
// Test el router determinista mantiene Auto sin red: el Entorno lo decide
// `config.entorno()` (bundle estático soldado en compilación — sustituye al
// antiguo `isTestMode()`/`NEXT_PUBLIC_ENV`, ADR 0011).
export const processChatResponse = makeProcessChatResponse(
  compactionAiAdapter,
  config.entorno() === "test"
    ? createDeterministicChatModeRouter()
    : createChatModeRouter(inferenceKit.decide),
);

export * from "./ports";
