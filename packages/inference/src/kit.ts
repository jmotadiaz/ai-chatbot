import { buildDefaultClients, buildEmbeddingClient, buildRerankClient } from "./clients";
import { buildDefaultDecisionsClients } from "./clients/decisions";
import { createLanguageModelResolver } from "./language-model";
import { createDecideResolver } from "./decide";
import type { CreateInferenceKitOptions, InferenceKit } from "./types";

/**
 * Builds an independent Inference Kit instance: its own client registry (real
 * by default, or overridden per kind via `options.clients`) and its own
 * memoization cache for `languageModel`. Importing this module builds
 * nothing — every client and every Model Configuration is constructed lazily,
 * on first use, scoped to the instance that resolves it.
 */
export function createInferenceKit(
  options: CreateInferenceKitOptions = {},
): InferenceKit {
  const clients = { ...buildDefaultClients(), ...options.clients };
  const decisionsClients = {
    ...buildDefaultDecisionsClients(),
    ...options.decisionsClients,
  };
  const languageModel = createLanguageModelResolver(
    clients,
    options.languageModel,
  );
  const decide = options.decide ?? createDecideResolver(decisionsClients);

  return {
    languageModel,
    clients,
    embeddingClient: buildEmbeddingClient(),
    rerankClient: buildRerankClient(),
    decide,
  };
}

/** Default instance. Consumers that need a substituted kit (tests, evals) build their own with `createInferenceKit`. */
export const inferenceKit: InferenceKit = createInferenceKit();
