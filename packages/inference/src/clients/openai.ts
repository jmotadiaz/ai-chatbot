import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";
import { buildLazyLanguageModelClient } from "./lazy-client";

/** Built explicitly instead of importing the SDK's bare `openai` singleton, so `OPENAI_API_KEY` is read via `config`. */
export function buildOpenAiClient(): (modelId: string) => LanguageModelV3 {
  return buildLazyLanguageModelClient(() =>
    createOpenAI({ apiKey: config.openaiApiKey() }),
  );
}
