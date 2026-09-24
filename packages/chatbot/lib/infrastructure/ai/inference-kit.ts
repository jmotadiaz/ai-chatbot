import "server-only";
import {
  createInferenceKit,
  inferenceKit as realInferenceKit,
  type InferenceClients,
  type InferenceKit,
} from "inference";
import { createMockRerankModel } from "inference/testing";
import { MODEL_CATALOG } from "models";
import { isTestMode } from "@/lib/infrastructure/env";
import { createMockEmbeddingModel, createMockModel } from "@/tests/mocks/ai";
import { MOCK_MODELS } from "@/tests/mocks/ai/registry";

/**
 * Single composition root for the chatbot's AI infrastructure: the one place
 * that reads `NEXT_PUBLIC_ENV` to choose between the real Inference Kit and a
 * kit backed by the mock registry. Every other module resolves models
 * through the `providers`/`languageModelConfigurations` reexports built on
 * top of this file, never by importing `inference` or checking `isTestMode`
 * itself — that keeps the test-mode switch out of `inference` entirely, per
 * the kit's own design (see `packages/inference`).
 */
function buildTestClients(): InferenceClients {
  // Providers are called with the provider-level model id
  // ("deepseek-v4.1-flash") while the mock registry is keyed by catalog id
  // ("Deepseek v4.1 Flash"), so the catalog translates one into the other.
  // Models without a specialised entry fall back to the generic,
  // content-driven createMockModel.
  const catalogIdsByProviderModel = new Map(
    MODEL_CATALOG.map((entry) => [
      `${entry.provider.kind}:${entry.provider.modelId}`,
      entry.id,
    ]),
  );

  const lookupMock = (kind: string) => (modelId: string) => {
    const catalogId = catalogIdsByProviderModel.get(`${kind}:${modelId}`);
    const mock = catalogId ? MOCK_MODELS[catalogId] : undefined;
    return mock ? mock.languageModel : createMockModel(modelId);
  };

  return {
    openai: lookupMock("openai"),
    xai: lookupMock("xai"),
    groq: lookupMock("groq"),
    perplexity: lookupMock("perplexity"),
    gateway: lookupMock("gateway"),
    openrouter: lookupMock("openrouter"),
    deepinfra: lookupMock("deepinfra"),
    lmstudio: lookupMock("lmstudio"),
    opencodeGo: lookupMock("opencodeGo"),
    opencodeGoResponses: lookupMock("opencodeGoResponses"),
    opencodeGoAnthropic: lookupMock("opencodeGoAnthropic"),
    opencodeZen: lookupMock("opencodeZen"),
  };
}

/**
 * Embedding and rerank are resolved by Model Role through the kit's `embed`/
 * `rerank` operations. In test mode, only the underlying client per kind is
 * swapped for a fake (same seam `clients` uses for language models) — the
 * operation itself (catalog resolution, dimensions, taskType validation)
 * still runs, so a bad role or taskType fails the same way it would in
 * production. `createMockEmbeddingModel` stays sourced from the chatbot's
 * own test mocks (not yet moved into `inference/testing`); `createMockRerankModel`
 * always resolves an empty ranking, matching this composition root's
 * pre-`embed`/`rerank` behaviour (`async () => []`).
 */
export const inferenceKit: InferenceKit = isTestMode()
  ? createInferenceKit({
      clients: buildTestClients(),
      embeddingClients: { google: () => createMockEmbeddingModel() },
      rerankClients: { cohere: () => createMockRerankModel() },
    })
  : realInferenceKit;
