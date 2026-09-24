import {
  INVOCABLE_MODEL_IDS,
  MODEL_CATALOG,
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

const getCatalogEntry = (modelId: string): ModelCatalogEntry => {
  const entry = MODEL_CATALOG.find((m) => m.id === modelId);
  if (!entry) {
    throw new Error(`Model ${modelId} not found in MODEL_CATALOG`);
  }
  return entry;
};

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
