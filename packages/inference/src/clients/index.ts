import type { InferenceClients } from "../types";
import { buildOpencodeClients } from "./opencode";
import { buildGatewayClient } from "./gateway";
import { buildOpenRouterClient } from "./openrouter";
import { buildOpenAiClient } from "./openai";
import { buildXaiClient } from "./xai";
import { buildGroqClient } from "./groq";
import { buildPerplexityClient } from "./perplexity";
import { buildLmstudioClient } from "./lmstudio";
import { buildDeepInfraClient } from "./deepinfra";

export { buildEmbeddingClient } from "./embedding";
export { buildRerankClient } from "./rerank";

/**
 * The real `Record<ProviderKind, …>` registry: one lazy, memoized client per
 * endpoint kind. Nothing here reads `config` or constructs an SDK client
 * until the returned function for a given kind is first called.
 */
export function buildDefaultClients(): InferenceClients {
  const opencode = buildOpencodeClients();

  return {
    ...opencode,
    gateway: buildGatewayClient(),
    openrouter: buildOpenRouterClient(),
    openai: buildOpenAiClient(),
    xai: buildXaiClient(),
    groq: buildGroqClient(),
    perplexity: buildPerplexityClient(),
    lmstudio: buildLmstudioClient(),
    deepinfra: buildDeepInfraClient(),
  };
}
