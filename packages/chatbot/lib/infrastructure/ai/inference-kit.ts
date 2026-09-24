import "server-only";
import {
  createInferenceKit,
  inferenceKit as realInferenceKit,
  type InferenceClients,
  type InferenceKit,
} from "inference";
import {
  createMockEmbeddingModel,
  createMockModel,
  createMockSpeechModel,
} from "inference/testing";
import { MODEL_CATALOG } from "models";
import { isTestMode } from "@/lib/infrastructure/env";
import {
  ALIAS_BEHAVIOURS,
  CAPABILITY_ALIASES,
  type CapabilityAlias,
} from "@/tests/mocks/ai/capabilities";

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
  // ("deepseek-v4.1-flash") while CAPABILITY_ALIASES is keyed by catalog id
  // ("Deepseek v4.1 Flash"), so the catalog translates one into the other.
  // Models without a specialised entry fall back to the generic,
  // content-driven createMockModel.
  const catalogIdsByProviderModel = new Map(
    MODEL_CATALOG.map((entry) => [
      `${entry.provider.kind}:${entry.provider.modelId}`,
      entry.id,
    ]),
  );

  // Reverse index built once from CAPABILITY_ALIASES: catalog id -> alias,
  // so resolving a model is a single lookup per call (entry -> alias ->
  // behaviour, the chain ticket 02's id-keyed registry used to do directly).
  const aliasByModelId = new Map<string, CapabilityAlias>(
    Object.entries(CAPABILITY_ALIASES).map(([alias, { id }]) => [
      id,
      alias as CapabilityAlias,
    ]),
  );

  const lookupMock = (kind: string) => (modelId: string) => {
    const catalogId = catalogIdsByProviderModel.get(`${kind}:${modelId}`);
    const alias = catalogId ? aliasByModelId.get(catalogId) : undefined;
    const behaviour = alias ? ALIAS_BEHAVIOURS[alias] : undefined;
    return behaviour ? behaviour.languageModel : createMockModel(modelId);
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

/**
 * Speech follows the same real-vs-mock switch as embedding/rerank above: it
 * is not part of `clients` either (see `packages/inference`'s `SpeechClients`,
 * a separate registry keyed by `SpeechProviderKind`), so it needs its own
 * line here rather than living inside `buildTestClients`.
 */
export const speechModel: InferenceKit["speechModel"] = isTestMode()
  ? () => createMockSpeechModel()
  : inferenceKit.speechModel;
