import type { LanguageModel, rerank } from "ai";
import type { EmbeddingModelV3, LanguageModelV3 } from "@ai-sdk/provider";
import type { GroqProviderOptions } from "@ai-sdk/groq";
import type { XaiProviderOptions } from "@ai-sdk/xai";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import type { Company, ModelCatalogEntry, ModelId, ProviderKind } from "models";

/**
 * Per-provider options the AI SDK accepts on a call, keyed by SDK. This is a
 * reexport surface (the kit "reexporta los tipos del AI SDK que necesitan los
 * consumidores"), not a new message/tool/stream type.
 */
export type ProviderOptions = {
  anthropic?: AnthropicProviderOptions;
  groq?: GroqProviderOptions;
  google?: GoogleGenerativeAIProviderOptions;
  openai?: OpenAIResponsesProviderOptions;
  xai?: XaiProviderOptions;
  gateway?: Omit<GatewayProviderOptions, "byok">;
};

/**
 * The expandable configuration `languageModel` resolves for a catalog id: the
 * constructed model plus every parameter a feature needs (temperature,
 * providerOptions, capability flags). Same shape the chatbot's
 * `languageModelConfigurations` returns today.
 */
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

export interface RerankResult {
  originalIndex: number;
  score: number;
}

/** One language-model client per endpoint kind (`ProviderKind`, see `models`). */
export type InferenceClients = Record<
  ProviderKind,
  (modelId: string) => LanguageModelV3
>;

export interface LanguageModelOptions {
  providerOptions?: ProviderOptions;
}

export interface InferenceKit {
  /**
   * Model Configuration for a catalog id: built from the matching client and
   * memoized on this kit instance (never rebuilt for the same id).
   */
  languageModel: (
    id: ModelId,
    options?: LanguageModelOptions,
  ) => ModelConfiguration;
  /** Per-endpoint-kind clients. Most consumers want `languageModel` instead. */
  clients: InferenceClients;
  /** Embedding client behind the current `embed` shim (moves to a full operation in a later ticket). */
  embeddingClient: () => EmbeddingModelV3;
  /** Rerank client behind the current `rerank` shim (moves to a full operation in a later ticket). */
  rerankClient: () => (
    args: Omit<Parameters<typeof rerank>[0], "model">,
  ) => Promise<RerankResult[]>;
}

export interface CreateInferenceKitOptions {
  /** Overrides one or more per-kind clients (e.g. a test double for a single kind). */
  clients?: Partial<InferenceClients>;
  /**
   * Overrides the model built for a catalog entry. Returning `undefined`
   * falls back to `clients[entry.provider.kind](entry.provider.modelId)`.
   * This is the seam a test composition uses to substitute mocks per catalog
   * id without touching `clients`.
   */
  languageModel?: (entry: ModelCatalogEntry) => LanguageModelV3 | undefined;
}
