import type { GroqProviderOptions } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import type {
  LanguageModelV3,
  EmbeddingModelV3,
  LanguageModelV2 as LanguageModelV2Interface,
} from "@ai-sdk/provider";
import type { XaiProviderOptions } from "@ai-sdk/xai";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { OpenRouterProviderOptions } from "@openrouter/ai-sdk-provider";
import type { RerankResponseResultsItem } from "cohere-ai/api";
import { GatewayProviderOptions } from "@ai-sdk/gateway";
import type { ChatbotMessage, Tools } from "@/lib/features/chat/types";
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
  | "xiaomi"
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
  /**
   * When true, tools are instructed via system prompts instead of toolChoice.
   * This allows models with extended thinking (like Claude) to generate
   * thinking blocks before calling tools.
   */
  toolCallingByPrompt?: boolean;
  reasoning?: boolean;
  supportedFiles?: Array<"pdf" | "img">;
  supportedOutput?: Array<"text" | "img">;
  temperature?: number;
  topP?: number;
  topK?: number;
  company: Company;
}

// Model and Routing Types

// --- From providers.ts ---

export interface RerankArgs {
  query: string;
  documents: string[];
  topN: number;
}

export interface Providers {
  anthropic: (modelId: string) => LanguageModelV3;
  openai: (modelId: string) => LanguageModelV3;
  google: (modelId: string) => LanguageModelV3;
  xai: (modelId: string) => LanguageModelV3;
  groq: (modelId: string) => LanguageModelV3;
  openrouter: (modelId: string) => LanguageModelV2Interface;
  deepseek: (modelId: string) => LanguageModelV3;
  perplexity: (modelId: string) => LanguageModelV3;
  gateway: (modelId: string) => LanguageModelV3;
  lmstudio: (modelId: string) => LanguageModelV3;
  embedding: () => EmbeddingModelV3;
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
