import { createXai } from "@ai-sdk/xai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";

/** Built explicitly and lazily instead of the module-scope `createXai()` singleton chatbot's `providers.ts` used to build eagerly, so `XAI_API_KEY` is read via `config` and no client exists until first use. */
export function buildXaiClient(): (modelId: string) => LanguageModelV3 {
  let _xai: ReturnType<typeof createXai> | null = null;
  const get = () => {
    if (!_xai) {
      _xai = createXai({ apiKey: config.xaiApiKey() });
    }
    return _xai;
  };
  return (modelId) => get()(modelId);
}
