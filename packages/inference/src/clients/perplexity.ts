import { createPerplexity } from "@ai-sdk/perplexity";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";

/** Built explicitly instead of importing the SDK's bare `perplexity` singleton, so `PERPLEXITY_API_KEY` is read via `config`. */
export function buildPerplexityClient(): (modelId: string) => LanguageModelV3 {
  let _perplexity: ReturnType<typeof createPerplexity> | null = null;
  const get = () => {
    if (!_perplexity) {
      _perplexity = createPerplexity({ apiKey: config.perplexityApiKey() });
    }
    return _perplexity;
  };
  return (modelId) => get()(modelId);
}
