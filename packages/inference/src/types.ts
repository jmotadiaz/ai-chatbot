import type { LanguageModel, ToolLoopAgent, ToolLoopAgentSettings, ToolSet } from "ai";
import type { LanguageModelV3, SpeechModelV3 } from "@ai-sdk/provider";
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
  LanguageModelRole,
  ModelCatalogEntry,
  ModelId,
  ProviderKind,
  RerankRole,
  SpeechModelId,
  SpeechProviderKind,
  SpeechRole,
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

/** One speech-model client per speech endpoint kind (`SpeechProviderKind`, see `models`). Not a `ProviderKind` — speech is a different endpoint. */
export type SpeechClients = Record<
  SpeechProviderKind,
  (modelId: string) => SpeechModelV3
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

/**
 * `languageModel`/`createAgent` accept either a raw catalog id or a Model
 * Role (`LANGUAGE_MODEL_ROLES` in `models`) — a role resolves to whatever
 * catalog id it currently points at.
 */
export type LanguageModelKey = ModelId | LanguageModelRole;

/** `speechModel` accepts either a raw `SPEECH_MODELS` id or a `SPEECH_ROLES` role. */
export type SpeechModelKey = SpeechModelId | SpeechRole;

export interface CreateAgentOptions<TOOLS extends ToolSet = ToolSet> {
  instructions?: ToolLoopAgentSettings<never, TOOLS>["instructions"];
  tools?: TOOLS;
  /**
   * The rest of the `ToolLoopAgent` constructor options (`stopWhen`,
   * `activeTools`, `prepareStep`, `maxRetries`, `experimental_telemetry`,
   * a `temperature`/`topP`/`topK` override, …) — whatever a call site needs
   * beyond the resolved model, `instructions` and `tools`.
   */
  overrides?: Partial<
    Omit<ToolLoopAgentSettings<never, TOOLS>, "model" | "instructions" | "tools">
  >;
}

export interface InferenceKit {
  /**
   * Model Configuration for a catalog id or Model Role: built from the
   * matching client and memoized on this kit instance by resolved catalog id
   * (never rebuilt for the same id, however it was addressed).
   */
  languageModel: (
    idOrRole: LanguageModelKey,
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
  /** Speech model for a `SPEECH_MODELS` id or `SPEECH_ROLES` role (voice/speed/instructions stay call-time parameters, not part of the model). */
  speechModel: (idOrRole: SpeechModelKey) => SpeechModelV3;
  /**
   * Resolves `idOrRole` via `languageModel`, wraps the model with tracing
   * when `TRACE_ENABLED=1` (the same `wrapWithTracing` the chatbot's
   * `conversation/factory.ts` calls today), and returns a `ToolLoopAgent` —
   * the repeated `new ToolLoopAgent({...modelConfiguration, ...})` pattern
   * in the Chat Modes, generalized behind the kit.
   */
  createAgent: <TOOLS extends ToolSet = ToolSet>(
    idOrRole: LanguageModelKey,
    options?: CreateAgentOptions<TOOLS>,
  ) => ToolLoopAgent<never, TOOLS>;
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
