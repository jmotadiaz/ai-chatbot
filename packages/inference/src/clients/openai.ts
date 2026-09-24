import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";

/** Built explicitly instead of importing the SDK's bare `openai` singleton, so `OPENAI_API_KEY` is read via `config`. */
export function buildOpenAiClient(): (modelId: string) => LanguageModelV3 {
  let _openai: ReturnType<typeof createOpenAI> | null = null;
  const get = () => {
    if (!_openai) {
      _openai = createOpenAI({ apiKey: config.openaiApiKey() });
    }
    return _openai;
  };
  return (modelId) => get()(modelId);
}
