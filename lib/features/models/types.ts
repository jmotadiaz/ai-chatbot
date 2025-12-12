import type { GroqProviderOptions } from "@ai-sdk/groq";
import type { LanguageModel, EmbeddingModel } from "ai";
import type { XaiProviderOptions } from "@ai-sdk/xai";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { OpenRouterProviderOptions } from "@openrouter/ai-sdk-provider";
import type { RerankResponseResultsItem } from "cohere-ai/api";
import { GatewayProviderOptions } from "@ai-sdk/gateway";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import type { Tools } from "@/lib/ai/tools/types";
// Types definitions for the models feature

// --- From definition.ts ---

export type Company =
  | "meta"
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "mistral"
  | "deepseek"
  | "perplexity"
  | "alibaba"
  | "moonshotai"
  | "minimax"
  | "zai"
  | "ai chatbot";

export type ProviderOptions = {
  anthropic?: AnthropicProviderOptions;
  groq?: GroqProviderOptions;
  google?: GoogleGenerativeAIProviderOptions;
  openai?: OpenAIResponsesProviderOptions;
  openrouter?: OpenRouterProviderOptions;
  xai?: XaiProviderOptions;
  gateway?: Omit<GatewayProviderOptions, "byok"> & {
    zeroDataRetention?: boolean;
  };
};

export interface ModelConfiguration {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  toolCalling?: boolean;
  nativeToolCalling?: boolean;
  reasoning?: boolean;
  supportedFiles?: Array<"pdf" | "img">;
  supportedOutput?: Array<"text" | "img">;
  temperature?: number;
  topP?: number;
  topK?: number;
  company: Company;
  systemPrompt?: string;
}

// We need to define LanguageModelKeys here or allow a circular dependency if we define it in constants.
// For now, I will use a placeholder or move the keys definition here if possible,
// but keys depend on the CONST object which is in constants.ts.
// In typescript we can reference typeof separate object.
// But to avoid circular deps, maybe I define the keys manually or just export the type from constants
// and import it here?
// Actually `LanguageModelKeys` is `keyof typeof LANGUAGE_MODEL_CONFIGURATIONS_CONST`.
// Since the object is the source of truth, `LanguageModelKeys` usually lives with the object.
// So I will NOT export LanguageModelKeys from here, but I will need `chatModelId` which depends on it.
// Wait, `chatModelId` depends on `LanguageModelKeys`.
// If I put `LanguageModelKeys` in `constants.ts`, then `types.ts` cannot import it if `constants.ts` imports `types.ts`.
//
// Solution: Define `LanguageModelKeys` and `chatModelId` in `constants.ts` because they are data-driven.
// OR move the CONST object structure interface here? No, the CONST object depends on `ModelConfiguration`.
//
// Let's keep data-driven types in `constants.ts` or `types.ts` if we can separate pure types.
// `Company` and `ProviderOptions` are pure types.
// `ModelConfiguration` is a pure type.
// `LanguageModelKeys` depends on the value.
//
// I will keep `LanguageModelKeys` and `chatModelId` in `constants.ts` or a new file if needed, but `constants.ts` seems appropriate.
// However `ModelRoutingMetadata` needs `model: string` but effectively it refers to model IDs.
//
// Let's put `ModelRoutingMetadata` here.

// --- From providers.ts ---

export type LanguageModelV2 = Exclude<LanguageModel, string>;

export type EmbeddingModelV2<T = string> = Exclude<EmbeddingModel<T>, string>;

export interface RerankArgs {
  query: string;
  documents: string[];
  topN: number;
}

export interface Providers {
  anthropic: (modelId: string) => LanguageModelV2;
  openai: (modelId: string) => LanguageModelV2;
  google: (modelId: string) => LanguageModelV2;
  xai: (modelId: string) => LanguageModelV2;
  groq: (modelId: string) => LanguageModelV2;
  openrouter: (modelId: string) => LanguageModelV2;
  deepseek: (modelId: string) => LanguageModelV2;
  perplexity: (modelId: string) => LanguageModelV2;
  gateway: (modelId: string) => LanguageModelV2;
  lmstudio: (modelId: string) => LanguageModelV2;
  embedding: () => EmbeddingModelV2;
  rerank: () => (args: RerankArgs) => Promise<RerankResponseResultsItem[]>;
}

export interface ProvidersFactory {
  (): Providers;
}

// --- From model-routing.ts ---

export const CATEGORIES = [
  "factual",
  "analytical",
  "technical",
  "creative",
  "prompt_engineering",
  "image_generation",
  "conversational",
  "processing",
  "other",
] as const;

export const COMPLEXITY_LEVELS = [
  "simple",
  "moderate",
  "complex",
  "advanced",
] as const;

export interface ModelRoutingMetadata {
  category: (typeof CATEGORIES)[number];
  complexity: (typeof COMPLEXITY_LEVELS)[number];
  model: string;
}

export interface ModelRoutingArguments {
  messages: ChatbotMessage[];
  tools?: Tools;
}

export interface ModelRoutingResult {
  modelConfiguration: ModelConfiguration;
  autoModelMetadata: ModelRoutingMetadata;
  tools: Tools;
}
