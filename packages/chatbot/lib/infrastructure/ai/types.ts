import type { LanguageModel, JSONValue, ToolLoopAgent, ToolLoopAgentSettings, ToolSet } from "ai";
import type { SpeechModelV3 } from "@ai-sdk/provider";
import type { GatewayModelEntry } from "@/lib/features/foundation-model/config";

/**
 * Re-export of the AI SDK's protocol types (`@ai-sdk/provider`) for tests and
 * features: the lint boundary forbids importing `@ai-sdk/*` outside this
 * directory (ADR 0010), but test DOUBLES and adapters need
 * the protocol's V3 types (`LanguageModelV3*`) to build typed
 * mocks. Re-exported here, consumable via `@/lib/infrastructure/ai/types`.
 */
export type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";

/**
 * Types of the chatbot's AI layer (previously re-exported from `inference`,
 * ADR 0010: they now live here). No per-provider types: with the single Gateway
 * all traffic speaks the OpenAI-compatible dialect, so
 * `providerOptions` is a `Record<string, Record<string, unknown>>` — the
 * shape the `@ai-sdk/openai-compatible` transport accepts (the provider key
 * is free-form; the transport validates it by schema and drops whatever it does not
 * recognise).
 */
export type ProviderOptions = Record<string, Record<string, JSONValue>>;
// The values are `JSONValue` — that is the shape the AI SDK requires in
// `SharedV3ProviderOptions` when the caller spreads the
// `ModelConfiguration` into `generateText`/`streamObject`/…

/**
 * Expandable configuration that `languageModel` resolves for a catalog
 * id (or a `*-default` contract): the built model plus every
 * parameter a feature needs (temperature, providerOptions, capability
 * flags).
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
  company: string;
}

export interface RerankResult {
  originalIndex: number;
  score: number;
}

export interface LanguageModelOptions {
  providerOptions?: ProviderOptions;
}

export interface EmbedOptions {
  taskType: EmbeddingTaskType;
}

/**
 * Google's embedding task hint, applied per call (shared contract §4:
 * the `task_type` field of the `POST /v1/embeddings` body), with the Gateway
 * falling back to `embedding-default` (`gemini-embedding-001`, 768 dimensions).
 */
export type EmbeddingTaskType =
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION"
  | "CLUSTERING"
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "QUESTION_ANSWERING"
  | "FACT_VERIFICATION"
  | "CODE_RETRIEVAL_QUERY";

export interface RerankArgs {
  query: string;
  documents: string[];
  topN?: number;
}

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

/** A single `type: "choice"` question sent to the Decisions API. */
export interface DecisionQuestion {
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
  /**
   * Default Model Contract that resolves the decision — today always
   * `"decision-default"` (Chat Mode Router and English Helper).
   */
  model: string;
  /**
   * The `choice` questions asked in this single call, keyed by their
   * wire-format name inside the Decisions API's `questions`/`answers` maps.
   * Some question models read the key as part of the question (not just an
   * addressing detail), so callers that must match an upstream contract pin
   * it explicitly. Several questions may travel in one request — the API
   * answers back under the same keys.
   */
  questions: Record<string, DecisionQuestion>;
  /** Passed through to the Decisions API as-is (text, an object, or an array of state entries). */
  state: string | Record<string, unknown> | unknown[];
  scope?: DecisionScope;
}

/**
 * Generic provenance of one answered question: what was chosen plus the
 * per-question observability fields. No question-specific typing (e.g. no
 * union of a question's option keys) — that narrowing belongs to the
 * consumer's own domain type, not this generic shape.
 */
export interface DecisionAnswer {
  choice: string;
  confidence?: number;
  probabilities?: Record<string, number>;
}

/**
 * Result of one `decide` call: the answers keyed by question name, plus the
 * per-call provenance shared by every question. A requested question whose
 * answer is missing or not a valid `choice` is simply absent from `answers`
 * (the caller's per-question fallback policy applies); the call only throws
 * when NO requested question yields a valid answer.
 */
export interface Decision {
  answers: Record<string, DecisionAnswer>;
  modelId: string;
  provider?: string;
  latencyMs: number;
  costUsd?: number;
}

/**
 * Surface of the chatbot's AI composition root (`inferenceKit`): all
 * operations speak to the Model Gateway (`${config.modelGatewayUrl()}/v1`).
 */
export interface InferenceKit {
  /**
   * Model Configuration for a catalog id or a `*-default` contract: built
   * from the catalog snapshot (metadata) plus a memoized Gateway client
   * (the `openai-compatible` transport addressed by the same id).
   */
  languageModel: (
    idOrContract: string,
    options?: LanguageModelOptions,
  ) => ModelConfiguration;
  /** Embeddings via `embedding-default` (768 dimensions + taskType). */
  embed: (values: string[], options: EmbedOptions) => Promise<number[][]>;
  /** Reranks documents via `rerank-default` against `POST /v1/rerank`. */
  rerank: (args: RerankArgs) => Promise<RerankResult[]>;
  /** Speech model via `tts-default` against `POST /v1/audio/speech`. */
  speechModel: () => SpeechModelV3;
  /**
   * Resolves `idOrContract` via `languageModel`, wraps the model with tracing
   * when `TRACE_ENABLED=1`, and returns a `ToolLoopAgent`.
   */
  createAgent: <TOOLS extends ToolSet = ToolSet>(
    idOrContract: string,
    options?: CreateAgentOptions<TOOLS>,
  ) => ToolLoopAgent<never, TOOLS>;
  /**
   * The traced Model Configuration `createAgent` builds a `ToolLoopAgent`
   * from, exposed on its own for a caller that needs the model itself
   * instead of a `ToolLoopAgent` (the chatbot's Context7 branch constructs a
   * different agent class from the same shape, and message processing only
   * needs the `reasoning` flag).
   */
  createAgentModel: (
    idOrContract: string,
    options?: LanguageModelOptions,
  ) => ModelConfiguration;
  /**
   * Answers one or more `choice` questions in a single Decisions API call
   * (`POST /v1/systemone` with `decision-default`), bounded by a fixed
   * timeout on both the request and the whole call. Errors propagate: the
   * fallback policy belongs to the caller.
   */
  decide: (options: DecideOptions) => Promise<Decision>;
  /** Public catalog (user-invocable models, no contracts) with a 60 s TTL cache. */
  fetchPublicModelCatalog: () => Promise<GatewayModelEntry[]>;
}
