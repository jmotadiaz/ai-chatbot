import { rerank } from "ai";
import { createCohere } from "@ai-sdk/cohere";
import { config } from "config";
import type { RerankResult } from "../types";

/**
 * Rerank is not a `ProviderKind` either. Built explicitly so `COHERE_API_KEY`
 * is read via `config` instead of the SDK's implicit fallback. Returns the
 * same shape `Providers.rerank()` returns today (a function, not the result),
 * so the chatbot's shim can keep calling it the same way.
 */
export function buildRerankClient(): () => (
  args: Omit<Parameters<typeof rerank>[0], "model">,
) => Promise<RerankResult[]> {
  let _cohere: ReturnType<typeof createCohere> | null = null;
  const get = () => {
    if (!_cohere) {
      _cohere = createCohere({ apiKey: config.cohereApiKey() });
    }
    return _cohere;
  };

  return () => async (args) => {
    const { ranking } = await rerank({
      ...args,
      model: get().rerankingModel("rerank-v4.0-pro"),
    });
    return ranking;
  };
}
