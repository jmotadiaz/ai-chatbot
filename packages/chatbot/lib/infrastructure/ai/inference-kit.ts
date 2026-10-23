import "server-only";

import { ToolLoopAgent, type ToolSet, type LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3, SpeechModelV3 } from "@ai-sdk/provider";
import { config, EMBEDDING_DIMENSIONS } from "config";
import { getTraceContext, isTracingEnabled, wrapWithTracing } from "tracing";
import { fetchPublicModelCatalog, getModelCatalogSnapshot } from "./catalog";
import { gatewayBaseUrl, gatewayHeaders } from "./gateway";
import { IMAGE_CONTRACT, createGatewayImageModel } from "./gateway-image-model";
import type {
  CreateAgentOptions,
  Decision,
  DecisionAnswer,
  DecideOptions,
  EmbedOptions,
  InferenceKit,
  LanguageModelOptions,
  ModelConfiguration,
  ProviderOptions,
  RerankArgs,
  RerankResult,
} from "./types";

/**
 * Composition root of the chatbot's AI layer (ADR 0010): a single
 * client against the Model Gateway (`${config.modelGatewayUrl()}/v1`,
 * authenticated with `config.modelGatewayApiKey()`). No `isTestMode()` and no
 * in-memory mocks: in the Test Environment `MODEL_GATEWAY_URL` points at the Mock
 * Model Gateway (`:4001`) and all traffic is HTTP, just like in dev/prod.
 *
 * Models are addressed by catalog id or by Default Model Contract
 * (`*-default`, the Gateway's 10 stable names). `"use client"` is
 * forbidden from importing this module (lint, `packages/chatbot/eslint.config.mjs`);
 * the UI-safe configuration lives in
 * `@/lib/features/foundation-model/config` and travels hydrated in the
 * `<ModelCatalogProvider>`.
 *
 * `languageModel`/`createAgent` are synchronous and read the catalog
 * snapshot (`getModelCatalogSnapshot()`): the warm-up points are
 * `app/(chat)/layout.tsx` and `conversation/factory.ts` (`warmModelCatalog`).
 */

// ---------------------------------------------------------------------------
// Gateway client (openai-compatible transport, memoized by id)
// ---------------------------------------------------------------------------

const buildGatewayProvider = () =>
  createOpenAICompatible({
    name: "model-gateway",
    baseURL: gatewayBaseUrl(),
    apiKey: config.modelGatewayApiKey() ?? undefined,
  });

const modelCache = new Map<string, ModelConfiguration>();

/**
 * Purpose-built transport for the image contract (`image-default`), memoized: the
 * generic `openai-compatible` does not parse image parts or accept
 * `modalities` in the body (see `gateway-image-model.ts`).
 */
let gatewayImageModel: LanguageModelV3 | undefined;

const mergeProviderOptions = (
  base: ModelConfiguration,
  providerOptions: ProviderOptions | undefined,
): ModelConfiguration => {
  if (!providerOptions) return base;
  return {
    ...base,
    providerOptions: { ...base.providerOptions, ...providerOptions },
  };
};

/**
 * `languageModel(idOrContract, options)`: catalog snapshot metadata + a
 * `@ai-sdk/openai-compatible` client built with the id
 * as-is (the catalog id IS the Gateway's model id), memoized by id.
 * The caller's `providerOptions` are applied fresh on every call.
 */
function languageModel(
  idOrContract: string,
  options?: LanguageModelOptions,
): ModelConfiguration {
  const entry = getModelCatalogSnapshot().find((e) => e.id === idOrContract);

  let base = modelCache.get(idOrContract);
  if (!base) {
    const model: LanguageModelV3 =
      idOrContract === IMAGE_CONTRACT
        ? (gatewayImageModel ??= createGatewayImageModel())
        : buildGatewayProvider().chatModel(idOrContract);
    base = {
      model: model as LanguageModel,
      company: entry?.company ?? "model-gateway",
      ...(entry?.reasoning !== undefined && { reasoning: entry.reasoning }),
      ...(entry?.temperature != null && { temperature: entry.temperature }),
      ...(entry?.topP != null && { topP: entry.topP }),
      ...(entry?.topK != null && { topK: entry.topK }),
      ...(entry?.contextWindow != null && {
        contextWindow: entry.contextWindow,
      }),
      ...(entry?.supportedFiles && {
        supportedFiles: [...entry.supportedFiles],
      }),
      ...(entry?.supportedOutput && {
        supportedOutput: [...entry.supportedOutput],
      }),
    };
    modelCache.set(idOrContract, base);
  }

  return mergeProviderOptions(base, options?.providerOptions);
}

// ---------------------------------------------------------------------------
// createAgent / createAgentModel (tracing wrap, as in the previous kit)
// ---------------------------------------------------------------------------

function resolveTracedModel(
  idOrContract: string,
  options?: LanguageModelOptions,
): ModelConfiguration {
  const base = languageModel(idOrContract, options);
  const model = wrapWithTracing(
    base.model as LanguageModelV3,
    config.traceRunId() ?? "default",
  );
  return { ...base, model };
}

function createAgentModel(
  idOrContract: string,
  options?: LanguageModelOptions,
): ModelConfiguration {
  return resolveTracedModel(idOrContract, options);
}

function createAgent<TOOLS extends ToolSet = ToolSet>(
  idOrContract: string,
  { instructions, tools, overrides }: CreateAgentOptions<TOOLS> = {},
): ToolLoopAgent<never, TOOLS> {
  const base = resolveTracedModel(idOrContract);

  return new ToolLoopAgent<never, TOOLS>({
    ...base,
    instructions,
    tools: tools as TOOLS,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Embeddings (`embedding-default`, 768 dimensions + task_type)
// ---------------------------------------------------------------------------

const EMBEDDING_CONTRACT = "embedding-default";

/**
 * `embed(values, { taskType })`: `POST /v1/embeddings` with
 * `{ model: "embedding-default", input, dimensions: 768, task_type }`
 * (shared contract §4). It goes through a direct fetch — the
 * `@ai-sdk/openai-compatible` transport validates its providerOptions against a
 * closed schema that does not accept `task_type`, and the Gateway contract asks for it as a
 * top-level body field.
 */
async function embed(
  values: string[],
  { taskType }: EmbedOptions,
): Promise<number[][]> {
  const response = await fetch(`${gatewayBaseUrl()}/embeddings`, {
    method: "POST",
    headers: { ...gatewayHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBEDDING_CONTRACT,
      input: values,
      dimensions: EMBEDDING_DIMENSIONS,
      task_type: taskType,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Embedding request failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as {
    data?: Array<{ index?: number; embedding?: number[] }>;
  };
  const data = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return data.map((item) => {
    if (!item.embedding) {
      throw new Error("Embedding response is missing an embedding vector");
    }
    return item.embedding;
  });
}

// ---------------------------------------------------------------------------
// Rerank (`rerank-default`, POST /v1/rerank)
// ---------------------------------------------------------------------------

const RERANK_CONTRACT = "rerank-default";

/** `rerank({ query, documents, topN })`: maps `{results:[{index, relevance_score}]}` → `{originalIndex, score}[]`. */
async function rerank(args: RerankArgs): Promise<RerankResult[]> {
  const response = await fetch(`${gatewayBaseUrl()}/rerank`, {
    method: "POST",
    headers: { ...gatewayHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: RERANK_CONTRACT,
      query: args.query,
      documents: args.documents,
      top_n: args.topN,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Rerank request failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as {
    results?: Array<{ index?: number; relevance_score?: number }>;
  };
  return (body.results ?? []).map((result) => ({
    originalIndex: result.index ?? 0,
    score: result.relevance_score ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Decisions (`decision-default`, POST /v1/systemone)
// ---------------------------------------------------------------------------

/** Budget for one decide() call: bounds the request and the whole call (same value `inference` used). */
const DECIDE_TIMEOUT_MS = 1500;

/** The Decisions API caps `session_id` at 256 characters. */
const SESSION_ID_MAX_CHARS = 256;

/**
 * The ambient trace scope (`sessionId`/`traceId` only — `traceName` has no
 * ambient source): prefers `chatId` over the generic `sessionId` as the
 * grouping key, same convention the kit's `decide` used.
 */
function ambientScope(): { sessionId?: string; traceId?: string } {
  const context = getTraceContext();
  if (!context) return {};

  return {
    sessionId: context.chatId ?? context.sessionId,
    traceId: isTracingEnabled() ? context.runId : undefined,
  };
}

const isChoiceAnswer = (
  value: unknown,
): value is { type: "choice"; choice: string; confidence?: number; probabilities?: Record<string, number> } =>
  typeof value === "object" &&
  value !== null &&
  (value as { type?: unknown }).type === "choice";

/** Wire-format `type` of a non-choice answer, for the error message. */
const answerKind = (answer: unknown): string =>
  answer && typeof answer === "object" && "type" in answer
    ? String((answer as { type: unknown }).type)
    : "missing";

/**
 * `decide(options)`: sends the `type: "choice"` questions from
 * `options.questions` (one or more) in a single call to
 * `POST /v1/systemone` with `decision-default`. Bounded by
 * `DECIDE_TIMEOUT_MS` (fetch timeout + the whole call's
 * signal). Each `scope` field falls back independently to the ambient
 * trace context. Answers are validated question by question: the one that is
 * missing or not a `choice` is omitted from `Decision.answers`, and the call only
 * throws if NO question produces a valid answer.
 */
async function decide(options: DecideOptions): Promise<Decision> {
  const questionNames = Object.keys(options.questions);
  if (questionNames.length === 0) {
    throw new Error("decide() requires at least one question");
  }
  const ambient = ambientScope();
  const sessionId = (options.scope?.sessionId ?? ambient.sessionId)?.slice(
    0,
    SESSION_ID_MAX_CHARS,
  );
  const traceId = options.scope?.traceId ?? ambient.traceId;
  const traceName = options.scope?.traceName ?? String(options.model);

  const startedAt = Date.now();
  const response = await fetch(`${gatewayBaseUrl()}/systemone`, {
    method: "POST",
    headers: { ...gatewayHeaders(), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(DECIDE_TIMEOUT_MS),
    body: JSON.stringify({
      model: options.model,
      questions: Object.fromEntries(
        Object.entries(options.questions).map(([name, question]) => [
          name,
          {
            type: "choice",
            instructions: question.instructions,
            criteria: { ...question.criteria },
          },
        ]),
      ),
      state: options.state,
      session_id: sessionId,
      trace: traceId ? { traceId, traceName } : undefined,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Decisions request failed: ${response.status} ${response.statusText}`,
    );
  }
  const latencyMs = Date.now() - startedAt;

  const raw = (await response.json()) as {
    answers?: Record<string, unknown>;
    model?: string;
    provider?: string;
    usage?: { cost?: number };
  };

  const answers: Record<string, DecisionAnswer> = {};
  let firstInvalidKind: string | undefined;
  for (const name of questionNames) {
    const answer = raw.answers?.[name];
    if (!isChoiceAnswer(answer)) {
      firstInvalidKind ??= answerKind(answer);
      continue;
    }
    answers[name] = {
      choice: answer.choice,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
    };
  }

  if (Object.keys(answers).length === 0) {
    throw new Error(
      `Unexpected Decisions answer: ${firstInvalidKind ?? "missing"}`,
    );
  }

  return {
    answers,
    modelId: raw.model ?? options.model,
    provider: raw.provider,
    latencyMs,
    costUsd: raw.usage?.cost,
  };
}

// ---------------------------------------------------------------------------
// Speech (`tts-default`, POST /v1/audio/speech)
// ---------------------------------------------------------------------------

/**
 * `speechModel()`: `tts-default` through the `@ai-sdk/openai` speech transport
 * (`/v1/audio/speech`). Voice, speed and instructions remain call parameters of
 * the feature, not of the model.
 */
export const speechModel = (): SpeechModelV3 =>
  createOpenAI({
    baseURL: gatewayBaseUrl(),
    apiKey: config.modelGatewayApiKey() ?? undefined,
  }).speech("tts-default");

// ---------------------------------------------------------------------------
// Kit
// ---------------------------------------------------------------------------

/**
 * Single chatbot instance. The `*-default` contracts that internal
 * features resolve live as literals at each call-site (see the
 * spec §2.4 table); the configuration of user-invocable models comes from the
 * catalog at runtime, not from here.
 */
export const inferenceKit: InferenceKit = {
  languageModel,
  embed,
  rerank,
  speechModel,
  createAgent,
  createAgentModel,
  decide,
  fetchPublicModelCatalog,
};
