import "server-only";

import deepmerge from "deepmerge";
import { wrapLanguageModel } from "ai";
import {
  MODEL_CATALOG,
  type ModelCatalogEntry,
  type ModelId,
} from "models";
import type { ModelConfiguration, ProviderOptions } from "./types";
import { reasoningMw } from "./utils";
import { providers } from "@/lib/infrastructure/ai/providers";

const buildModelConfiguration = (
  entry: ModelCatalogEntry,
): ModelConfiguration => {
  const base = providers[entry.provider.kind](entry.provider.modelId);
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
};

export const LANGUAGE_MODEL_CONFIGURATIONS_CONST: Record<
  ModelId,
  ModelConfiguration
> = Object.fromEntries(
  MODEL_CATALOG.map((entry) => [entry.id, buildModelConfiguration(entry)]),
) as Record<ModelId, ModelConfiguration>;

export const languageModelConfigurations = (
  modelKey: ModelId,
  { providerOptions }: { providerOptions?: ProviderOptions } = {},
): ModelConfiguration => {
  const baseConfig: ModelConfiguration =
    LANGUAGE_MODEL_CONFIGURATIONS_CONST[modelKey];

  if (providerOptions && baseConfig.providerOptions) {
    return {
      ...baseConfig,
      providerOptions: deepmerge(baseConfig.providerOptions, providerOptions),
    };
  }

  return {
    ...baseConfig,
    ...(providerOptions && { providerOptions }),
  };
};
