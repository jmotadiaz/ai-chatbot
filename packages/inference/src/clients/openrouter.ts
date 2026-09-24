import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";

export function buildOpenRouterClient(): (modelId: string) => LanguageModelV3 {
  let _openrouter: ReturnType<typeof createOpenRouter> | null = null;
  const get = () => {
    if (!_openrouter) {
      _openrouter = createOpenRouter({ apiKey: config.openRouterApiKey() });
    }
    return _openrouter;
  };
  return (modelId) => get()(modelId);
}
