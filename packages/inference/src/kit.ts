import {
  buildDefaultClients,
  buildEmbeddingClient,
  buildRerankClient,
  buildSpeechClients,
} from "./clients";
import { createAgentResolver } from "./create-agent";
import { createLanguageModelResolver } from "./language-model";
import { createSpeechModelResolver } from "./speech-model";
import type { CreateInferenceKitOptions, InferenceKit } from "./types";

/**
 * Builds an independent Inference Kit instance: its own client registry (real
 * by default, or overridden per kind via `options.clients`) and its own
 * memoization cache for `languageModel`/`speechModel`. Importing this module
 * builds nothing — every client and every Model Configuration is constructed
 * lazily, on first use, scoped to the instance that resolves it.
 */
export function createInferenceKit(
  options: CreateInferenceKitOptions = {},
): InferenceKit {
  const clients = { ...buildDefaultClients(), ...options.clients };
  const languageModel = createLanguageModelResolver(
    clients,
    options.languageModel,
  );
  const speechModel = createSpeechModelResolver(buildSpeechClients());

  return {
    languageModel,
    clients,
    embeddingClient: buildEmbeddingClient(),
    rerankClient: buildRerankClient(),
    speechModel,
    createAgent: createAgentResolver(languageModel),
  };
}

/** Default instance. Consumers that need a substituted kit (tests, evals) build their own with `createInferenceKit`. */
export const inferenceKit: InferenceKit = createInferenceKit();
