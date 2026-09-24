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
  createMockRerankModel,
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
 * kit backed by the mock registry. Every feature imports `inferenceKit` (or
 * `speechModel`) directly from this module — the transitional
 * `providers`/`languageModelConfigurations` reexports are gone — and never
 * imports `inference` or checks `isTestMode` itself, which keeps the
 * test-mode switch out of `inference` entirely, per the kit's own design
 * (see `packages/inference`). A `"use client"` file must not import this
 * module either (enforced by lint, see `packages/chatbot/eslint.config.mjs`):
 * UI-safe model config lives in `@/lib/features/foundation-model/config`.
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

/**
 * Embedding and rerank are resolved by Model Role through the kit's `embed`/
 * `rerank` operations. In test mode, only the underlying client per kind is
 * swapped for a fake (same seam `clients` uses for language models) — the
 * operation itself (catalog resolution, dimensions, taskType validation)
 * still runs, so a bad role or taskType fails the same way it would in
 * production. Both fakes come from `inference/testing`; `createMockRerankModel`
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

/**
 * Speech follows the same real-vs-mock switch as embedding/rerank above, but
 * `CreateInferenceKitOptions` has no per-kind override for it yet (no
 * `speechClients` option — speech is not resolved through `clients` either),
 * so it keeps its own line here instead of folding into the `inferenceKit`
 * construction above.
 */
export const speechModel: InferenceKit["speechModel"] = isTestMode()
  ? () => createMockSpeechModel()
  : inferenceKit.speechModel;
