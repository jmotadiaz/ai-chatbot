import { createGroq } from "@ai-sdk/groq";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";
import { buildLazyLanguageModelClient } from "./lazy-client";

/** Built explicitly instead of importing the SDK's bare `groq` singleton, so `GROQ_API_KEY` is read via `config`. */
export function buildGroqClient(): (modelId: string) => LanguageModelV3 {
  return buildLazyLanguageModelClient(() =>
    createGroq({ apiKey: config.groqApiKey() }),
  );
}
