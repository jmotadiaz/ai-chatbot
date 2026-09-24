import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV3 } from "@ai-sdk/provider";

/** Local model server; no key. Still lazy so nothing is built at import time. */
export function buildLmstudioClient(): (modelId: string) => LanguageModelV3 {
  let _lmstudio: ReturnType<typeof createOpenAICompatible> | null = null;
  const get = () => {
    if (!_lmstudio) {
      _lmstudio = createOpenAICompatible({
        name: "lmstudio",
        baseURL: "http://localhost:1234/v1",
      });
    }
    return _lmstudio;
  };
  return (modelId) => get()(modelId);
}
