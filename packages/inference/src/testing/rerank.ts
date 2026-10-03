import { MockRerankingModelV3 } from "ai/test";
import type { RerankingModelV3 } from "@ai-sdk/provider";

/**
 * A fake reranking model that always resolves an empty ranking, regardless
 * of the query or documents it receives. Matches the chatbot's test-mode
 * rerank behaviour (`async () => []`) from before the `rerank` kit operation
 * existed, now expressed as a model the real AI SDK `rerank()` call can run
 * against (so the operation's own logic still executes the same way it does
 * in production; only the network call is faked).
 */
export function createMockRerankModel(): RerankingModelV3 {
  return new MockRerankingModelV3({
    doRerank: async () => ({ ranking: [] }),
  });
}
