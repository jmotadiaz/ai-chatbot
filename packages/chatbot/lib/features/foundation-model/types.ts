import type { GroqProviderOptions } from "@ai-sdk/groq";
import type { LanguageModel, rerank } from "ai";
import type { LanguageModelV3, EmbeddingModelV3 } from "@ai-sdk/provider";
import type { XaiProviderOptions } from "@ai-sdk/xai";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { GatewayProviderOptions } from "@ai-sdk/gateway";
import type { Company, ProviderKind } from "models";
// Types definitions for the models feature

// --- From definition.ts ---

export type { Company };

export type ProviderOptions = {
  anthropic?: AnthropicProviderOptions;
  groq?: GroqProviderOptions;
  google?: GoogleGenerativeAIProviderOptions;
  openai?: OpenAIResponsesProviderOptions;
  xai?: XaiProviderOptions;
  gateway?: Omit<GatewayProviderOptions, "byok">;
};

export interface ModelConfiguration {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  reasoning?: boolean;
  supportedFiles?: Array<"pdf" | "img">;
  supportedOutput?: Array<"text" | "img">;
  temperature?: number;
  topP?: number;
  topK?: number;
  contextWindow?: number;
  company: Company;
}

// --- From providers.ts ---

export interface RerankArgs {
  query: string;
  documents: string[];
  topN: number;
}

export interface RerankResult {
  originalIndex: number;
  score: number;
}

// Language-model clients, one per endpoint kind. `ProviderKind` is the Model
// Catalog's key of client + API flavor (see `models`); deriving this map from
// it means an unused or missing kind is a compile error here, not a silent
// gap. Embedding and rerank are not endpoint kinds in the catalog, so they
// stay as their own operations on the same registry.
export interface Providers extends Record<ProviderKind, (modelId: string) => LanguageModelV3> {
  embedding: () => EmbeddingModelV3;
  rerank: () => (
    args: Omit<Parameters<typeof rerank>[0], "model">,
  ) => Promise<RerankResult[]>;
}

export interface ProvidersFactory {
  (): Providers;
}
