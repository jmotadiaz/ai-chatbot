import { buildDefaultClients, buildEmbeddingClients, buildRerankClients } from "./clients";
import { createLanguageModelResolver } from "./language-model";
import { createEmbedResolver } from "./embed";
import { createRerankResolver } from "./rerank";
import type { CreateInferenceKitOptions, InferenceKit } from "./types";

/**
 * Builds an independent Inference Kit instance: its own client registries
 * (real by default, or overridden per kind via `options.clients`/
 * `options.embeddingClients`/`options.rerankClients`) and its own
 * memoization cache for `languageModel`. Importing this module builds
 * nothing — every client and every Model Configuration is constructed lazily,
 * on first use, scoped to the instance that resolves it.
 */
export function createInferenceKit(
  options: CreateInferenceKitOptions = {},
): InferenceKit {
  const clients = { ...buildDefaultClients(), ...options.clients };
  const languageModel = createLanguageModelResolver(
    clients,
    options.languageModel,
  );

  const embeddingClients = { ...buildEmbeddingClients(), ...options.embeddingClients };
  const rerankClients = { ...buildRerankClients(), ...options.rerankClients };

  return {
    languageModel,
    clients,
    embed: createEmbedResolver(embeddingClients),
    rerank: createRerankResolver(rerankClients),
  };
}

/** Default instance. Consumers that need a substituted kit (tests, evals) build their own with `createInferenceKit`. */
export const inferenceKit: InferenceKit = createInferenceKit();
