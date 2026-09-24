import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";

export function buildDeepInfraClient(): (modelId: string) => LanguageModelV3 {
  let _deepinfra: ReturnType<typeof createOpenAICompatible> | null = null;
  const get = () => {
    if (!_deepinfra) {
      _deepinfra = createOpenAICompatible({
        name: "deepinfra",
        apiKey: config.deepInfraApiKey(),
        baseURL: "https://api.deepinfra.com/v1/openai",
        supportsStructuredOutputs: false,
      });
    }
    return _deepinfra;
  };
  return (modelId) => get()(modelId);
}
