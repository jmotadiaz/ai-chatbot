import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { EmbeddingModelV3 } from "@ai-sdk/provider";
import { config } from "config";

/**
 * Embedding is not a `ProviderKind` (it is not a language-model endpoint), so
 * it gets its own lazy client instead of a `clients` registry entry. Built
 * explicitly so `GOOGLE_GENERATIVE_AI_API_KEY` is read via `config` instead of
 * the SDK's implicit fallback.
 */
export function buildEmbeddingClient(): () => EmbeddingModelV3 {
  let _google: ReturnType<typeof createGoogleGenerativeAI> | null = null;
  const get = () => {
    if (!_google) {
      _google = createGoogleGenerativeAI({
        apiKey: config.googleGenerativeAiApiKey(),
      });
    }
    return _google;
  };
  return () => get().embeddingModel("gemini-embedding-001");
}
