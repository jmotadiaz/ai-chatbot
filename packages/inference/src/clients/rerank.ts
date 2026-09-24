import { createCohere } from "@ai-sdk/cohere";
import type { RerankingModelV3 } from "@ai-sdk/provider";
import { config } from "config";
import type { RerankProviderKind } from "models";

/** One reranking-model client per `RerankProviderKind` (see `models`). */
export type RerankClients = Record<
  RerankProviderKind,
  (modelId: string) => RerankingModelV3
>;

/**
 * Rerank is not a `ProviderKind` either. Its own lazy client registry, built
 * explicitly so `COHERE_API_KEY` is read via `config` instead of the SDK's
 * implicit fallback.
 */
export function buildRerankClients(): RerankClients {
  let _cohere: ReturnType<typeof createCohere> | null = null;
  const getCohere = () => {
    if (!_cohere) {
      _cohere = createCohere({ apiKey: config.cohereApiKey() });
    }
    return _cohere;
  };

  return {
    cohere: (modelId) => getCohere().rerankingModel(modelId),
  };
}
