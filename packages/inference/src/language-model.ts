import deepmerge from "deepmerge";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import {
  LANGUAGE_MODEL_ROLES,
  MODEL_CATALOG,
  type LanguageModelRole,
  type ModelCatalogEntry,
  type ModelId,
} from "models";
import type {
  InferenceClients,
  LanguageModelKey,
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

function isLanguageModelRole(key: LanguageModelKey): key is LanguageModelRole {
  return Object.prototype.hasOwnProperty.call(LANGUAGE_MODEL_ROLES, key);
}

/** A Model Role resolves to whatever catalog id it currently points at; a plain id passes through unchanged. */
function resolveModelId(key: LanguageModelKey): ModelId {
  return isLanguageModelRole(key)
    ? (LANGUAGE_MODEL_ROLES[key] as ModelId)
    : (key as ModelId);
}

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
 * Builds `languageModel(idOrRole, options)`: resolves a catalog id or a
 * Model Role (`LANGUAGE_MODEL_ROLES`) to its expandable Model Configuration,
 * constructing (and memoizing) the underlying model on first use. The cache
 * key is the *resolved* catalog id, so addressing the same model by role or
 * by its literal id — or by two different roles that happen to point at the
 * same id today, like `compactionText`/`metaPromptRefiner` — reuses the same
 * constructed model and returns an equal configuration. `providerOptions`
 * overrides are applied fresh on every call, regardless of memoization.
 */
export function createLanguageModelResolver(
  clients: InferenceClients,
  languageModelOverride?: LanguageModelOverride,
): (key: LanguageModelKey, options?: LanguageModelOptions) => ModelConfiguration {
  const cache = new Map<ModelId, ModelConfiguration>();

  return (key, options) => {
    const id = resolveModelId(key);
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
