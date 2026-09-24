import "server-only";
import {
  createInferenceKit,
  inferenceKit as realInferenceKit,
  type InferenceClients,
  type InferenceKit,
} from "inference";
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

export const inferenceKit: InferenceKit = isTestMode()
  ? createInferenceKit({ clients: buildTestClients() })
  : realInferenceKit;

/**
 * Embedding and rerank are not resolved through `createInferenceKit`'s
 * `clients`/`languageModel` options yet (they become full `embed`/`rerank`
 * operations in a later ticket), so this composition root switches them the
 * same way `providers.ts` did before the kit existed: same mocks, same
 * condition, just relocated.
 */
export const embeddingClient: InferenceKit["embeddingClient"] = isTestMode()
  ? () => createMockEmbeddingModel()
  : inferenceKit.embeddingClient;

export const rerankClient: InferenceKit["rerankClient"] = isTestMode()
  ? () => async () => []
  : inferenceKit.rerankClient;
