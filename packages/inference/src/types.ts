import type { LanguageModel } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { GroqProviderOptions } from "@ai-sdk/groq";
import type { XaiProviderOptions } from "@ai-sdk/xai";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import type {
  Company,
  EmbeddingRole,
  EmbeddingTaskType,
  ModelCatalogEntry,
  ModelId,
  ProviderKind,
  RerankRole,
} from "models";
import type { EmbeddingClients } from "./clients/embedding";
import type { RerankClients } from "./clients/rerank";

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

export interface EmbedOptions {
  taskType: EmbeddingTaskType;
}

export interface RerankArgs {
  query: string;
  documents: string[];
  topN?: number;
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
  /** Embeddings for an Embedding Role, dimensions and taskType applied from `EMBEDDING_MODELS`. */
  embed: (
    role: EmbeddingRole,
    values: string[],
    options: EmbedOptions,
  ) => Promise<number[][]>;
  /** Reranks documents for a Rerank Role, resolved from `RERANK_MODELS`. */
  rerank: (role: RerankRole, args: RerankArgs) => Promise<RerankResult[]>;
}

export interface CreateInferenceKitOptions {
  /** Overrides one or more per-kind language-model clients (e.g. a test double for a single kind). */
  clients?: Partial<InferenceClients>;
  /**
   * Overrides the model built for a catalog entry. Returning `undefined`
   * falls back to `clients[entry.provider.kind](entry.provider.modelId)`.
   * This is the seam a test composition uses to substitute mocks per catalog
   * id without touching `clients`.
   */
  languageModel?: (entry: ModelCatalogEntry) => LanguageModelV3 | undefined;
  /** Overrides one or more per-kind embedding clients (e.g. a fake embedding model for tests). */
  embeddingClients?: Partial<EmbeddingClients>;
  /** Overrides one or more per-kind rerank clients (e.g. a fake reranking model for tests). */
  rerankClients?: Partial<RerankClients>;
}
