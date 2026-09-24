import deepmerge from "deepmerge";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MODEL_CATALOG, type ModelCatalogEntry, type ModelId } from "models";
import type {
  InferenceClients,
  LanguageModelOptions,
  ModelConfiguration,
  ProviderOptions,
} from "./types";

type LanguageModelOverride = (
  entry: ModelCatalogEntry,
) => LanguageModelV3 | undefined;

const reasoningMw = extractReasoningMiddleware({
  tagName: "think",
  separator: "\n",
  startWithReasoning: false,
});

const catalogById = new Map<ModelId, ModelCatalogEntry>(
  MODEL_CATALOG.map((entry) => [entry.id as ModelId, entry]),
);

function buildBaseConfiguration(
  entry: ModelCatalogEntry,
  clients: InferenceClients,
  languageModelOverride?: LanguageModelOverride,
): ModelConfiguration {
  const base =
    languageModelOverride?.(entry) ??
    clients[entry.provider.kind](entry.provider.modelId);

  return {
    model: entry.wrapWithReasoningMiddleware
      ? wrapLanguageModel({ model: base, middleware: [reasoningMw] })
      : base,
    company: entry.company,
    ...(entry.reasoning !== undefined && { reasoning: entry.reasoning }),
    ...(entry.temperature !== undefined && { temperature: entry.temperature }),
    ...(entry.topP !== undefined && { topP: entry.topP }),
    ...(entry.topK !== undefined && { topK: entry.topK }),
    ...(entry.contextWindow !== undefined && {
      contextWindow: entry.contextWindow,
    }),
    ...(entry.supportedFiles && {
      supportedFiles: [...entry.supportedFiles],
    }),
    ...(entry.supportedOutput && {
      supportedOutput: [...entry.supportedOutput],
    }),
    ...(entry.providerOptions && {
      providerOptions: entry.providerOptions as ProviderOptions,
    }),
  };
}

function mergeProviderOptions(
  base: ModelConfiguration,
  providerOptions: ProviderOptions | undefined,
): ModelConfiguration {
  if (!providerOptions) return base;
  if (base.providerOptions) {
    return {
      ...base,
      providerOptions: deepmerge(base.providerOptions, providerOptions),
    };
  }
  return { ...base, providerOptions };
}

/**
 * Builds `languageModel(id, options)`: resolves a catalog id to its
 * expandable Model Configuration, constructing (and memoizing) the
 * underlying model on first use. Every call after the first for the same id
 * reuses the same constructed model, regardless of `providerOptions`
 * overrides, which are applied fresh on every call.
 */
export function createLanguageModelResolver(
  clients: InferenceClients,
  languageModelOverride?: LanguageModelOverride,
): (id: ModelId, options?: LanguageModelOptions) => ModelConfiguration {
  const cache = new Map<ModelId, ModelConfiguration>();

  return (id, options) => {
    let baseConfig = cache.get(id);
    if (!baseConfig) {
      const entry = catalogById.get(id);
      if (!entry) {
        throw new Error(`Model ${id} not found in MODEL_CATALOG`);
      }
      baseConfig = buildBaseConfiguration(entry, clients, languageModelOverride);
      cache.set(id, baseConfig);
    }
    return mergeProviderOptions(baseConfig, options?.providerOptions);
  };
}
