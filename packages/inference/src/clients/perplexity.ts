import { createPerplexity } from "@ai-sdk/perplexity";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";
import { buildLazyLanguageModelClient } from "./lazy-client";

/** Built explicitly instead of importing the SDK's bare `perplexity` singleton, so `PERPLEXITY_API_KEY` is read via `config`. */
export function buildPerplexityClient(): (modelId: string) => LanguageModelV3 {
  return buildLazyLanguageModelClient(() =>
    createPerplexity({ apiKey: config.perplexityApiKey() }),
  );
}
