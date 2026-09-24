import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";
import { buildLazyLanguageModelClient } from "./lazy-client";

export function buildDeepInfraClient(): (modelId: string) => LanguageModelV3 {
  return buildLazyLanguageModelClient(() =>
    createOpenAICompatible({
      name: "deepinfra",
      apiKey: config.deepInfraApiKey(),
      baseURL: "https://api.deepinfra.com/v1/openai",
      supportsStructuredOutputs: false,
    }),
  );
}
