import deepmerge from "deepmerge";
import { wrapLanguageModel } from "ai";
import {
  INVOCABLE_MODEL_IDS,
  MODEL_CATALOG,
  type InvocableModelId,
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

export type LanguageModelKeys = ModelId;

export const chatModelKeys: chatModelId[] = [...INVOCABLE_MODEL_IDS];

export type chatModelId = InvocableModelId;

export const CHAT_MODELS: chatModelId[] = [...chatModelKeys];

// Constants
export const defaultModel: chatModelId = chatModelKeys[0]!;

export const defaultWebSearchNumResults = 4;
export const defaultRagMaxResources = 4;
export const defaultMinRagScore = 0.5;

// Helpers
export const languageModelConfigurations = (
  modelKey: LanguageModelKeys,
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

export interface ChatModelConfiguration {
  company: ModelConfiguration["company"];
  temperature?: number;
  topP?: number;
  topK?: number;
  contextWindow?: number;
  reasoning: boolean;
  zeroDataRetention?: boolean;
  supportedFiles: Required<ModelConfiguration>["supportedFiles"];
  supportedOutput: Required<ModelConfiguration>["supportedOutput"];
}

export const getChatConfigurationByModelId = (
  modelId: chatModelId,
): ChatModelConfiguration => {
  const modelConfig = languageModelConfigurations(modelId);

  return {
    company: modelConfig.company,
    temperature: modelConfig.temperature,
    topP: modelConfig.topP,
    topK: modelConfig.topK,
    contextWindow: modelConfig.contextWindow,
    reasoning: modelConfig.reasoning ?? false,
    zeroDataRetention: modelConfig.providerOptions?.gateway?.zeroDataRetention,
    supportedFiles: modelConfig.supportedFiles ?? [],
    supportedOutput: modelConfig.supportedOutput ?? ["text"],
  };
};
