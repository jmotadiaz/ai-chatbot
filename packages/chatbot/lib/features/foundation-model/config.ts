import {
  INVOCABLE_MODEL_IDS,
  MODEL_CATALOG,
  resolveCatalogEntry,
  type Company,
  type InvocableModelId,
  type ModelCatalogEntry,
  type ModelId,
} from "models";

export type LanguageModelKeys = ModelId;

export const chatModelKeys: chatModelId[] = [...INVOCABLE_MODEL_IDS];

export type chatModelId = InvocableModelId;

export const CHAT_MODELS: chatModelId[] = [...chatModelKeys];

// Constants
export const defaultModel: chatModelId = chatModelKeys[0]!;

export const defaultWebSearchNumResults = 4;
export const defaultRagMaxResources = 4;
export const defaultMinRagScore = 0.5;

export interface ChatModelConfiguration {
  company: Company;
  temperature?: number;
  topP?: number;
  topK?: number;
  contextWindow?: number;
  reasoning: boolean;
  zeroDataRetention?: boolean;
  supportedFiles: ("pdf" | "img")[];
  supportedOutput: ("text" | "img")[];
}

const catalogById = new Map<ModelId, ModelCatalogEntry>(
  MODEL_CATALOG.map((entry) => [entry.id as ModelId, entry]),
);

const getCatalogEntry = (modelId: string): ModelCatalogEntry =>
  resolveCatalogEntry<ModelId, ModelCatalogEntry>(catalogById, modelId as ModelId, {
    kind: "Model",
    catalogName: "MODEL_CATALOG",
  }).entry;

export const getChatConfigurationByModelId = (
  modelId: chatModelId,
): ChatModelConfiguration => {
  const entry = getCatalogEntry(modelId);

  return {
    company: entry.company,
    temperature: entry.temperature,
    topP: entry.topP,
    topK: entry.topK,
    contextWindow: entry.contextWindow,
    reasoning: entry.reasoning ?? false,
    zeroDataRetention:
      (entry.providerOptions?.gateway as { zeroDataRetention?: boolean } | undefined)
        ?.zeroDataRetention,
    supportedFiles: entry.supportedFiles ? [...entry.supportedFiles] : [],
    supportedOutput: entry.supportedOutput ? [...entry.supportedOutput] : ["text"],
  };
};
