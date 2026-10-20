import type { LanguageModel, JSONValue, ToolLoopAgent, ToolLoopAgentSettings, ToolSet } from "ai";
import type { SpeechModelV3 } from "@ai-sdk/provider";
import type { GatewayModelEntry } from "@/lib/features/foundation-model/config";

/**
 * Reexport de tipos de protocolo del AI SDK (`@ai-sdk/provider`) para test y
 * features: la frontera de lint prohibe importar `@ai-sdk/*` fuera de este
 * directorio (ADR 0010), pero los DOUBLES de test y los adaptadores necesitan
 * los tipos V3 del protocolo (`LanguageModelV3*`) para construir mocks
 * tipados. Reexportados aquí, consumibles vía `@/lib/infrastructure/ai/types`.
 */
export type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";

/**
 * Tipos de la capa de IA del chatbot (antes reexportados de `inference`,
 * ADR 0010: ahora viven aquí). Sin tipos por proveedor: con el Gateway único
 * todo el tráfico habla el dialecto OpenAI-compatible, así que
 * `providerOptions` es un `Record<string, Record<string, unknown>>` — la
 * forma que acepta el transport `@ai-sdk/openai-compatible` (la key de
 * proveedor es libre; el transport la valida por esquema y tira la que no
 * reconozca).
 */
export type ProviderOptions = Record<string, Record<string, JSONValue>>;
// Los valores son `JSONValue` — es la forma que el AI SDK exige en
// `SharedV3ProviderOptions` cuando el caller hace spread de la
// `ModelConfiguration` en `generateText`/`streamObject`/…

/**
 * Configuración expandible que `languageModel` resuelve para un id del
 * catálogo (o un contrato `*-default`): el modelo construido más cada
 * parámetro que una feature necesita (temperature, providerOptions, flags de
 * capacidades).
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
 * Google's embedding task hint, applied per call (contrato compartido §4:
 * campo `task_type` del body de `POST /v1/embeddings`). Antes vivía en
 * `packages/models/src/embedding-catalog.ts`.
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
   * Default Model Contract que resuelve la decisión — hoy siempre
   * `"decision-default"` (Chat Mode Router y English Helper).
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
 * Surface of the chatbot's AI composition root (`inferenceKit`): todas las
 * operaciones hablan con el Model Gateway (`${config.modelGatewayUrl()}/v1`).
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
  /** Embeddings vía `embedding-default` (768 dimensiones + taskType). */
  embed: (values: string[], options: EmbedOptions) => Promise<number[][]>;
  /** Reranks documents vía `rerank-default` contra `POST /v1/rerank`. */
  rerank: (args: RerankArgs) => Promise<RerankResult[]>;
  /** Speech model vía `tts-default` contra `POST /v1/audio/speech`. */
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
   * (`POST /v1/decisions` con `decision-default`), bounded by a fixed
   * timeout on both the request and the whole call. Errors propagate: the
   * fallback policy belongs to the caller.
   */
  decide: (options: DecideOptions) => Promise<Decision>;
  /** Catálogo completo (contratos incluidos) con caché TTL de 60 s. */
  fetchModelCatalog: () => Promise<GatewayModelEntry[]>;
}
