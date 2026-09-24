import {
  INVOCABLE_MODEL_IDS,
  MODEL_CATALOG,
  type InvocableModelId,
  type ModelCatalogEntry,
  type ModelId,
} from "models";
import type { Company } from "./types";

export type LanguageModelKeys = ModelId;

export const chatModelKeys: chatModelId[] = [...INVOCABLE_MODEL_IDS];

export type chatModelId = InvocableModelId;

export const CHAT_MODELS: chatModelId[] = [...chatModelKeys];

// Constants
export const defaultModel: chatModelId = chatModelKeys[0]!;

/**
 * Parses a persisted model id (`Chat.defaultModel`, `Project.defaultModel`)
 * before it reaches the chat. Those columns are free-form and nullable: rows
 * written without a model hold NULL, and catalog retunes retire ids that older
 * rows still reference. `getChatConfigurationByModelId` throws for both while
 * rendering the chat, so they fall back to the default model. Any other
 * catalog id is kept, including models no longer offered in the picker.
 */
export const resolveChatModelId = (
  modelId: string | null | undefined,
): chatModelId =>
  MODEL_CATALOG.some((entry) => entry.id === modelId)
    ? (modelId as chatModelId)
    : defaultModel;

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
