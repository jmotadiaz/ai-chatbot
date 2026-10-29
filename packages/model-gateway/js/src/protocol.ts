/**
 * Protocol layer of the Model Gateway testing toolkit.
 *
 * Pure fixtures and rendering: no Node built-ins (`node:http`, `Buffer`) and no
 * MSW. Every function here works in a browser-like environment (jsdom) and is
 * shared by both transports: the MSW handlers and the HTTP server render the same
 * `ChatReply`/`OperationReply` through this module, so there is exactly one
 * implementation of the wire format.
 */

import type {
  ChatDelta,
  ChatReply,
  ChatStep,
  DecisionsRequest,
  EmbeddingsRequest,
  OperationReply,
  RenderedChatResponse,
  RerankRequest,
  SseEvent,
  SpeechRequest,
} from "./types";

// ---------------------------------------------------------------------------
// Deterministic protocol constants
// ---------------------------------------------------------------------------

/** Fixed completion id: rendered responses stay byte-identical across runs. */
export const CHAT_COMPLETION_ID = "chatcmpl-mock-gateway";

/** Fixed `created` value, for the same reason as `CHAT_COMPLETION_ID`. */
export const CHAT_COMPLETION_CREATED = 1_700_000_000;

/** Final SSE frame of a completed stream. */
export const SSE_DONE_FRAME = "data: [DONE]\n\n";

/**
 * Probe route of the HTTP server. It is answered without authentication (a
 * health probe carries no credentials) and it is not recorded as a request.
 */
export const HEALTH_PATH = "/__mock-gateway/health";

/** Body of the probe route. */
export const HEALTH_BODY = { mock: "model-gateway" } as const;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

// ---------------------------------------------------------------------------
// Chat reply builders (protocol fixtures the consumer composes)
// ---------------------------------------------------------------------------

/** A single assistant text turn that finishes with `stop`. */
export function textReply(text: string): ChatReply {
  return {
    steps: [
      { delta: { role: "assistant", content: text } },
      { delta: {}, finishReason: "stop" },
    ],
  };
}

/** A turn that streams `reasoning_content` before the final text. */
export function reasoningReply({
  reasoning,
  text,
}: {
  reasoning: string;
  text: string;
}): ChatReply {
  return {
    steps: [
      { delta: { role: "assistant" } },
      { delta: { reasoning_content: reasoning } },
      { delta: { content: text } },
      { delta: {}, finishReason: "stop" },
    ],
  };
}

/**
 * A turn that asks the client to execute tool calls (`finish_reason:
 * tool_calls`). The continuation is the consumer's business: it decides from the
 * request history, not from a shared counter.
 */
export function toolCallReply({
  calls,
}: {
  calls: readonly { id: string; name: string; arguments: string }[];
}): ChatReply {
  return {
    steps: [
      { delta: { role: "assistant" } },
      {
        delta: {
          tool_calls: calls.map((call, index) => ({
            index,
            id: call.id,
            type: "function" as const,
            function: { name: call.name, arguments: call.arguments },
          })),
        },
      },
      { delta: {}, finishReason: "tool_calls" },
    ],
  };
}

/**
 * The text turn emitted AFTER a tool result. It is the same rendering as
 * `textReply`; the separate name documents the protocol moment (and keeps the
 * consumer's script readable).
 */
export function toolResultReply(text: string): ChatReply {
  return textReply(text);
}

/**
 * A multipart reply (text + `image_url` data URL) as served by the image
 * contract on `/v1/chat/completions`.
 */
export function imageReply({
  text,
  base64,
  mediaType,
}: {
  text: string;
  base64: string;
  mediaType: string;
}): ChatReply {
  const parts = [
    { type: "text", text },
    { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
  ];
  return {
    steps: [
      { delta: { role: "assistant", content: parts } },
      { delta: {}, finishReason: "stop" },
    ],
    json: parts,
  };
}

/**
 * A turn that emits `text` and then cuts the stream with an SSE error event,
 * without the final `[DONE]` frame (the OpenAI-compatible client parses it as an
 * `error` part with finish reason `error`).
 */
export function midStreamErrorReply({
  text,
  error,
}: {
  text: string;
  error: unknown;
}): ChatReply {
  return {
    steps: [
      { delta: { role: "assistant", content: text } },
      { delta: {}, error },
    ],
    json: text,
  };
}

/**
 * A text turn paced `delayMs` apart between every step (role, each chunk and the
 * finish step). It keeps a stream alive long enough for a test to disconnect or
 * close the server mid-flight; the JSON rendering returns the joined text.
 */
export function pacedTextReply({
  chunks,
  delayMs,
}: {
  chunks: readonly string[];
  delayMs: number;
}): ChatReply {
  return {
    steps: [
      { delta: { role: "assistant" }, delayMs },
      ...chunks.map((text) => ({ delta: { content: text }, delayMs })),
      { delta: {}, finishReason: "stop", delayMs },
    ],
    json: chunks.join(""),
  };
}

/**
 * Escape hatch: a reply assembled from explicit steps, still protocol-shaped so
 * both transports render it identically. A consumer can spread the result to add
 * a `json` (non-streaming) content:
 * `{ ...scriptedReply(steps), json: "…" }`.
 */
export function scriptedReply(steps: readonly ChatStep[]): ChatReply {
  return { steps: [...steps] };
}

// ---------------------------------------------------------------------------
// Chat rendering (single implementation for MSW and the HTTP server)
// ---------------------------------------------------------------------------

function sseChunk(
  delta: ChatDelta,
  finishReason: string | undefined,
  model: string | undefined,
): string {
  const payload = {
    id: CHAT_COMPLETION_ID,
    object: "chat.completion.chunk",
    created: CHAT_COMPLETION_CREATED,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason ?? null,
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Content of the non-streaming message, derived from the steps when unset. */
function derivedContent(steps: readonly ChatStep[]): unknown {
  const contents = steps
    .map((step) => step.delta.content)
    .filter((content): content is string | unknown[] => content !== undefined);
  const arrayContent = contents.findLast((content) => Array.isArray(content));
  if (arrayContent !== undefined) return arrayContent;
  return contents.filter((content): content is string => typeof content === "string").join("");
}

function completionBody(reply: ChatReply, model: string | undefined): unknown {
  return {
    id: CHAT_COMPLETION_ID,
    object: "chat.completion",
    created: CHAT_COMPLETION_CREATED,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: reply.json ?? derivedContent(reply.steps),
        },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 3, completion_tokens: 10, total_tokens: 13 },
  };
}

/**
 * Renders a `ChatReply` to the exact wire format. Streaming returns ordered SSE
 * events (each carrying its own pacing), non-streaming returns the completion
 * body. Both transports consume this same output.
 */
export function renderChatResponse(
  reply: ChatReply,
  options: { stream?: boolean; model?: string } = {},
): RenderedChatResponse {
  const model = reply.model ?? options.model;
  if (!options.stream) {
    return { kind: "json", body: completionBody(reply, model) };
  }

  const events: SseEvent[] = [];
  for (const step of reply.steps) {
    if (step.error !== undefined) {
      events.push({
        frame: `data: ${JSON.stringify(step.error)}\n\n`,
        delayMs: step.delayMs,
      });
      // A stream error ends the turn: no [DONE] frame follows it.
      return { kind: "sse", events };
    }
    events.push({
      frame: sseChunk(step.delta ?? {}, step.finishReason, model),
      delayMs: step.delayMs,
    });
  }
  events.push({ frame: SSE_DONE_FRAME });
  return { kind: "sse", events };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** Consumer-owned catalog entries, split by visibility. */
export interface GatewayCatalog {
  /** Entries listed by default (`user_invocable: true` in the real Gateway). */
  public: readonly unknown[];
  /** Default Model Contracts, listed only with `?include_internal=true`. */
  internal?: readonly unknown[];
}

/**
 * Pass-through of the consumer-owned catalog. The toolkit does not own the entry
 * schema and does not reorder: the consumer's order is the response's order.
 * `include_internal` follows the Gateway: only the literal `"true"` enables the
 * internal view.
 */
export function catalogResponse(
  catalog: GatewayCatalog,
  options: { includeInternal?: boolean } = {},
): { models: unknown[] } {
  return {
    models: options.includeInternal
      ? [...catalog.public, ...(catalog.internal ?? [])]
      : [...catalog.public],
  };
}

// ---------------------------------------------------------------------------
// Embeddings / rerank / decisions / speech
// ---------------------------------------------------------------------------

/**
 * Deterministic vector derived from the text (FNV-1a per position): same inputs
 * → same values, with no external seed needed.
 */
export function deterministicEmbedding(text: string, dimensions: number): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < dimensions; i += 1) {
    let hash = 2166136261; // FNV-1a offset basis
    const seed = `${text}:${i}`;
    for (let j = 0; j < seed.length; j += 1) {
      hash ^= seed.charCodeAt(j);
      hash = Math.imul(hash, 16777619);
    }
    // Normalized to [-1, 1] with a stable sign.
    embedding.push(((hash >>> 0) % 2000 - 1000) / 1000);
  }
  return embedding;
}

/**
 * Embeddings response for the requested inputs. `dimensions` comes from the
 * consumer (the Gateway's configured embedding width), never from an implicit
 * default, so a test that asserts vector length configures it explicitly.
 */
/**
 * Embeddings reply. `vectors[i]` replaces the deterministic vector of the i-th
 * input, so a consumer can hand in EXACT vectors (prepared fixtures) instead of
 * depending on the hash. Missing entries fall back to the deterministic vector;
 * this is a fixture generator, not an algorithm that pretends to be a model.
 */
export function embeddingsResponse(
  request: EmbeddingsRequest,
  options: { dimensions: number; model?: string; vectors?: number[][] },
): OperationReply {
  const inputs = Array.isArray(request.input) ? request.input : [request.input ?? ""];
  const model = request.model ?? options.model ?? "embedding-default";
  return {
    body: {
      object: "list",
      model,
      data: inputs.map((input, index) => ({
        object: "embedding",
        index,
        embedding:
          options.vectors?.[index] ??
          deterministicEmbedding(input, options.dimensions),
      })),
      usage: { prompt_tokens: 10, total_tokens: 10 },
    },
  };
}

/**
 * Rerank response. The default ranking is empty (the chatbot's historical test
 * semantics: hybrid search behaves as pure vector search). A consumer with a
 * ranking to assert passes `results` explicitly.
 */
export function rerankResponse(
  request: RerankRequest,
  options: { model?: string; results?: unknown[] } = {},
): OperationReply {
  return {
    body: {
      model: request.model ?? options.model ?? "rerank-default",
      results: options.results ?? [],
    },
  };
}

/** Rendered answer of one `choice` question, as the Decisions API returns it. */
interface DecisionsAnswerBody {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

/**
 * Decisions (TypeSafe/SystemOne) response: for each `choice` question it answers
 * with the declared criterion (`options.choices`, keyed by question) or, when a
 * question declares none, with its first criterion (deterministic). Confidence
 * is 1 and the probabilities are uniform across the criteria.
 *
 * `choices` is the consumer's declaration ("routing answers with `web`"); the
 * toolkit stays free of application routing. A choice outside its question's
 * criteria is an invalid configuration, not a silent success.
 *
 * `answerFields` overlays extra fields on the rendered answer of a question — the
 * confidence the Gateway reports, an extra probability key: answers the uniform
 * rendering never invents, which a consumer would otherwise have to rebuild from
 * the rendered body. A question named here that the request does not ask as a
 * `choice` question is invalid configuration too, not a silent no-op.
 */
export function decisionsResponse(
  request: DecisionsRequest,
  options: {
    model?: string;
    provider?: string;
    choices?: Readonly<Record<string, string>>;
    answerFields?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  } = {},
): OperationReply {
  const model = request.model ?? options.model ?? "decision-default";
  const answers: Record<string, DecisionsAnswerBody> = {};
  for (const [name, question] of Object.entries(request.questions ?? {})) {
    const criteria = Object.keys(question.criteria ?? {});
    if (question.type !== "choice" || criteria.length === 0) continue;
    const choice = options.choices?.[name] ?? criteria[0]!;
    if (!criteria.includes(choice)) {
      throw new Error(
        `Decisions choice "${choice}" is not one of the criteria of question "${name}" (${criteria.join(", ")})`,
      );
    }
    const uniform = 1 / criteria.length;
    answers[name] = {
      type: "choice",
      choice,
      confidence: 1,
      probabilities: Object.fromEntries(criteria.map((criterion) => [criterion, uniform])),
    };
  }

  for (const [name, fields] of Object.entries(options.answerFields ?? {})) {
    const rendered = answers[name];
    if (rendered === undefined) {
      throw new Error(
        `Decisions answer fields refer to question "${name}", which this request does not ask as a choice question`,
      );
    }
    answers[name] = { ...rendered, ...fields };
  }

  return {
    body: {
      answers,
      model,
      provider: options.provider ?? "mock-model-gateway",
      usage: { cost: 0 },
    },
  };
}

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    bytes[offset + i] = text.charCodeAt(i);
  }
}

/**
 * Minimal WAV (44-byte header + deterministic 800-sample PCM). The exact bytes do
 * not matter to the consumers (only that the audio is valid and stable across
 * runs). `Uint8Array` instead of `Buffer` keeps this module environment-neutral.
 */
export function deterministicWav(input: string): Uint8Array {
  const samples = 800;
  const data = new Uint8Array(samples * 2);
  const dataView = new DataView(data.buffer);
  for (let i = 0; i < samples; i += 1) {
    const amplitude = input.length === 0
      ? 0
      : ((input.charCodeAt(i % input.length) + i) % 128) - 64;
    dataView.setInt16(i * 2, amplitude * 96, true);
  }

  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  writeAscii(header, 0, "RIFF");
  view.setUint32(4, 36 + data.length, true);
  writeAscii(header, 8, "WAVE");
  writeAscii(header, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true); // sample rate
  view.setUint32(28, 16000, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(header, 36, "data");
  view.setUint32(40, data.length, true);

  const wav = new Uint8Array(header.length + data.length);
  wav.set(header, 0);
  wav.set(data, header.length);
  return wav;
}

/** Speech response: deterministic WAV served with the contract's media type. */
export function speechResponse(
  request: SpeechRequest,
  options: { mediaType?: string } = {},
): OperationReply {
  return {
    headers: { "Content-Type": options.mediaType ?? "audio/mpeg" },
    body: deterministicWav(request.input ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Error replies
// ---------------------------------------------------------------------------

/** Body shape of an explicit protocol error. */
export function errorBody(
  message: string,
  type: string,
): { error: { message: string; type: string } } {
  return { error: { message, type } };
}

/** 401 returned by default when the request has no bearer header. */
export function unauthorizedResponse(): OperationReply {
  return {
    status: 401,
    body: {
      error: {
        message: "Missing Authorization header",
        type: "auth_error",
        code: "unauthorized",
      },
    },
  };
}

export { JSON_HEADERS, SSE_HEADERS };
