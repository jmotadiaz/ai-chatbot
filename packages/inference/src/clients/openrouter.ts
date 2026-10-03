import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";
import { buildLazyLanguageModelClient } from "./lazy-client";

export function buildOpenRouterClient(): (modelId: string) => LanguageModelV3 {
  return buildLazyLanguageModelClient(() =>
    createOpenRouter({ apiKey: config.openRouterApiKey() }),
  );
}
