import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { EmbeddingModelV3 } from "@ai-sdk/provider";
import { config } from "config";
import type { EmbeddingProviderKind } from "models";

/** One embedding-model client per `EmbeddingProviderKind` (see `models`). */
export type EmbeddingClients = Record<
  EmbeddingProviderKind,
  (modelId: string) => EmbeddingModelV3
>;

/**
 * Embedding is not a `ProviderKind` (it is not a language-model endpoint), so
 * it gets its own lazy client registry instead of joining `InferenceClients`.
 * Built explicitly so `GOOGLE_GENERATIVE_AI_API_KEY` is read via `config`
 * instead of the SDK's implicit fallback.
 */
export function buildEmbeddingClients(): EmbeddingClients {
  let _google: ReturnType<typeof createGoogleGenerativeAI> | null = null;
  const getGoogle = () => {
    if (!_google) {
      _google = createGoogleGenerativeAI({
        apiKey: config.googleGenerativeAiApiKey(),
      });
    }
    return _google;
  };

  return {
    google: (modelId) => getGoogle().embeddingModel(modelId),
  };
}
