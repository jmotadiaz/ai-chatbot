import "server-only";

import { ToolLoopAgent, type ToolSet, type LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3, SpeechModelV3 } from "@ai-sdk/provider";
import { config } from "config";
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
 * Composition root de la capa de IA del chatbot (ADR 0010): un único
 * cliente contra el Model Gateway (`${config.modelGatewayUrl()}/v1`,
 * autenticado con `config.modelGatewayApiKey()`). Sin `isTestMode()` ni
 * mocks en memoria: en el Entorno de Test `MODEL_GATEWAY_URL` apunta al Mock
 * Model Gateway (`:4001`) y todo el tráfico es HTTP, igual que en dev/prod.
 *
 * Los modelos se dirigen por id del catálogo o por Default Model Contract
 * (`*-default`, los 10 nombres estables del Gateway). A `"use client"` le
 * está prohibido importar este módulo (lint, `packages/chatbot/eslint.config.mjs`);
 * la configuración segura para UI vive en
 * `@/lib/features/foundation-model/config` y viaja hidratada en el
 * `<ModelCatalogProvider>`.
 *
 * `languageModel`/`createAgent` son síncronos y leen el snapshot del
 * catálogo (`getModelCatalogSnapshot()`): los puntos de calentamiento son
 * `app/(chat)/layout.tsx` y `conversation/factory.ts` (`warmModelCatalog`).
 */

// ---------------------------------------------------------------------------
// Cliente Gateway (transport openai-compatible, memoizado por id)
// ---------------------------------------------------------------------------

const buildGatewayProvider = () =>
  createOpenAICompatible({
    name: "model-gateway",
    baseURL: gatewayBaseUrl(),
    apiKey: config.modelGatewayApiKey() ?? undefined,
  });

const modelCache = new Map<string, ModelConfiguration>();

/**
 * Transport propio del contrato de imagen (`image-default`), memoizado: el
 * `openai-compatible` genérico no parsea partes de imagen ni admite
 * `modalities` en el body (ver `gateway-image-model.ts`).
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
 * `languageModel(idOrContract, options)`: metadatos del snapshot del
 * catálogo + un cliente `@ai-sdk/openai-compatible` construido con el id
 * tal cual (el id de catálogo ES el model id del Gateway), memoizado por id.
 * `providerOptions` del caller se aplican frescos en cada llamada.
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
// createAgent / createAgentModel (tracing wrap, como en el kit anterior)
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
// Embeddings (`embedding-default`, 768 dimensiones + task_type)
// ---------------------------------------------------------------------------

const EMBEDDING_CONTRACT = "embedding-default";
const EMBEDDING_DIMENSIONS = 768;

/**
 * `embed(values, { taskType })`: `POST /v1/embeddings` con
 * `{ model: "embedding-default", input, dimensions: 768, task_type }`
 * (contrato compartido §4). Va por fetch directo — el transport
 * `@ai-sdk/openai-compatible` valida sus providerOptions contra un esquema
 * cerrado que no admite `task_type`, y el contrato del Gateway lo pide como
 * campo de primer nivel del body.
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

/** `rerank({ query, documents, topN })`: mapea `{results:[{index, relevance_score}]}` → `{originalIndex, score}[]`. */
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
// Decisions (`decision-default`, POST /v1/decisions)
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
 * `decide(options)`: envía las preguntas `type: "choice"` de
 * `options.questions` (una o más) en una sola llamada a
 * `POST /v1/decisions` con `decision-default`. Acotada por
 * `DECIDE_TIMEOUT_MS` (timeout del fetch + signal del conjunto de la
 * llamada). Cada campo de `scope` cae de forma independiente al contexto de
 * traza ambiente. Las respuestas se validan pregunta a pregunta: la que
 * falte o no sea `choice` se omite de `Decision.answers`, y la llamada solo
 * lanza si NINGUNA pregunta produce respuesta válida.
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
  const response = await fetch(`${gatewayBaseUrl()}/decisions`, {
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
 * `speechModel()`: `tts-default` vía el transport speech de `@ai-sdk/openai`
 * (`/v1/audio/speech`). Voz, speed e instructions siguen siendo parámetros
 * de llamada de la feature, no del modelo.
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
 * Instancia única del chatbot. Los contratos `*-default` que resuelven las
 * features internas viven como literales en cada call-site (ver tabla de la
 * spec §2.4); la configuración de los modelos user-invocable llega del
 * catálogo en runtime, no de aquí.
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
