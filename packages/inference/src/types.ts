import type { LanguageModel, ToolLoopAgent, ToolLoopAgentSettings, ToolSet } from "ai";
import type { LanguageModelV3, SpeechModelV3 } from "@ai-sdk/provider";
import type { GroqProviderOptions } from "@ai-sdk/groq";
import type { XaiProviderOptions } from "@ai-sdk/xai";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import type { OpenRouter } from "@openrouter/sdk";
import type {
  Company,
  DecisionModelId,
  DecisionProviderKind,
  DecisionRole,
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

/**
 * Only the `.alpha.decisions.create` surface is used, kept structural (not a
 * class type) so a real `OpenRouter` instance wired to a canned fetcher can
 * stand in for tests, same seam the chat-mode-routing adapter used before
 * this moved into the kit.
 */
export type DecisionsClient = Pick<OpenRouter, "alpha">;

/** One Decisions-API client per decision endpoint kind (`DecisionProviderKind`, see `models`). */
export type DecisionsClients = Record<DecisionProviderKind, () => DecisionsClient>;

/** A single `type: "choice"` question sent to the Decisions API. */
export interface DecisionQuestion {
  /**
   * Wire-format key for this question inside the Decisions API's
   * `questions`/`answers` maps. Some question models read the key as part of
   * the question (not just an addressing detail), so callers that must match
   * an upstream contract can pin it explicitly. Defaults to `"decision"`.
   */
  name?: string;
  instructions: string;
  criteria: Record<string, string>;
}

/**
 * Trace scope for one `decide` call. Each field falls back independently to
 * the ambient trace context (`tracing`'s `getTraceContext()`) when omitted —
 * passing `scope` never blocks the fallback for a field the caller didn't
 * set, including passing `{}`. `traceName` has no ambient source: it defaults
 * to `String(options.model)` when not set.
 */
export interface DecisionScope {
  sessionId?: string;
  traceId?: string;
  traceName?: string;
}

export interface DecideOptions {
  /** Decision catalog id or Model Role (see `DECISION_ROLES` in `models`). */
  model: DecisionModelId | DecisionRole;
  question: DecisionQuestion;
  /** Passed through to the Decisions API as-is (text, an object, or an array of state entries). */
  state: string | Record<string, unknown> | unknown[];
  scope?: DecisionScope;
}

/**
 * Generic provenance of one decision: what was chosen plus everything needed
 * for per-turn accounting and observability. No question-specific typing
 * (e.g. no union of a question's option keys) — that narrowing belongs to the
 * consumer's own domain type, not this generic shape.
 */
export interface Decision {
  choice: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  modelId: string;
  provider?: string;
  latencyMs: number;
  costUsd?: number;
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
   * `conversation/factory.ts` used to call directly before this moved into
   * the kit), and returns a `ToolLoopAgent` — the repeated
   * `new ToolLoopAgent({...modelConfiguration, ...})` pattern in the Chat
   * Modes, generalized behind the kit.
   */
  createAgent: <TOOLS extends ToolSet = ToolSet>(
    idOrRole: LanguageModelKey,
    options?: CreateAgentOptions<TOOLS>,
  ) => ToolLoopAgent<never, TOOLS>;
  /**
   * The traced Model Configuration `createAgent` builds a `ToolLoopAgent`
   * from, exposed on its own for a caller that needs the model itself
   * instead of a `ToolLoopAgent` — the chatbot's Context7 branch constructs a
   * different agent class (`Context7Agent`) from the same shape, and message
   * processing only needs the `reasoning` flag. No chatbot code calls
   * `wrapWithTracing`/`isTracingEnabled` itself; this is the kit's own job.
   */
  createAgentModel: (
    idOrRole: LanguageModelKey,
    options?: LanguageModelOptions,
  ) => ModelConfiguration;
  /**
   * Answers a single `choice` question through the Decisions API, bounded by
   * a fixed timeout on both the SDK attempt and the whole call. Errors
   * propagate: the fallback policy belongs to the caller.
   */
  decide: (options: DecideOptions) => Promise<Decision>;
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
  /** Overrides one or more Decisions-API clients by kind (mirrors `clients`). */
  decisionsClients?: Partial<DecisionsClients>;
  /**
   * Overrides `decide` wholesale — the seam a test composition uses to inject
   * a fake decide (no network, no Decisions client at all) without touching
   * `decisionsClients`.
   */
  decide?: (options: DecideOptions) => Promise<Decision>;
}
