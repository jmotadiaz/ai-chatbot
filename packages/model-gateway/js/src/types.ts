/**
 * Wire-shaped types of the Model Gateway HTTP protocol that the testing toolkit
 * needs. They are structural on purpose: the consumer owns its catalog schema and
 * request payloads, the toolkit only reads the fields that decide a response.
 */

/** Headers as received by the Node server or by an MSW handler (lowercase keys). */
export type GatewayHeaders = Record<string, string | string[] | undefined>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: string;
  content?: unknown;
  [key: string]: unknown;
}

export interface ChatRequest {
  model?: string;
  stream?: boolean;
  temperature?: number;
  messages?: ChatMessage[];
  [key: string]: unknown;
}

export interface EmbeddingsRequest {
  model?: string;
  input?: string | string[];
  dimensions?: number;
  [key: string]: unknown;
}

export interface RerankRequest {
  model?: string;
  query?: string;
  documents?: string[];
  top_n?: number;
  [key: string]: unknown;
}

export interface DecisionQuestion {
  type?: string;
  instructions?: string;
  criteria?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DecisionsRequest {
  model?: string;
  state?: unknown;
  questions?: Record<string, DecisionQuestion>;
  [key: string]: unknown;
}

export interface SpeechRequest {
  model?: string;
  input?: string;
  voice?: string;
  [key: string]: unknown;
}

/**
 * A single recorded request. `body` is the parsed JSON body when the payload is
 * valid JSON, and the raw string otherwise.
 */
export interface RecordedRequest {
  method: string;
  path: string;
  headers: GatewayHeaders;
  body: unknown;
}

/** Arguments accepted by `GatewayScenario.handle`. */
export interface GatewayRequestInit {
  /** Raw request body (a JSON string for the Gateway operations). */
  body?: unknown;
  headers?: GatewayHeaders;
}

// ---------------------------------------------------------------------------
// Chat replies (protocol description, transport-neutral)
// ---------------------------------------------------------------------------

export interface ChatToolCallDelta {
  index: number;
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** OpenAI-compatible `choices[0].delta`. */
export interface ChatDelta {
  role?: "assistant";
  content?: string | unknown[];
  reasoning_content?: string;
  tool_calls?: ChatToolCallDelta[];
}

/**
 * One step of a chat reply. `error` cuts the stream: it is rendered as an SSE
 * `data: {"error": …}` event without a trailing `[DONE]`. `delayMs` paces the
 * streaming rendering only (the JSON rendering returns the whole reply at once).
 */
export interface ChatStep {
  delta: ChatDelta;
  finishReason?: string;
  error?: unknown;
  delayMs?: number;
}

/**
 * A chat response as a description, not as bytes. `json` is the message content
 * of the non-streaming rendering; when absent it is derived from the steps.
 * `model` is echoed in the rendered payload when the consumer sets it.
 */
export interface ChatReply {
  steps: ChatStep[];
  json?: unknown;
  model?: string;
}

/** One rendered SSE event: the exact frame and its optional pacing. */
export interface SseEvent {
  frame: string;
  delayMs?: number;
}

export type RenderedChatResponse =
  | { kind: "sse"; events: SseEvent[] }
  | { kind: "json"; body: unknown };

// ---------------------------------------------------------------------------
// Operation replies and dispatch results
// ---------------------------------------------------------------------------

/**
 * Response of a non-chat operation. Responders return this envelope so an
 * explicit status and content type are always possible.
 */
export interface OperationReply {
  status?: number;
  headers?: Record<string, string>;
  body: unknown;
}

/** Transport-neutral result of a scenario dispatch. */
export type GatewayResult =
  | { kind: "json"; status: number; headers?: Record<string, string>; body: unknown }
  | {
      kind: "binary";
      status: number;
      headers: Record<string, string>;
      body: Uint8Array;
    }
  | { kind: "sse"; status: number; events: SseEvent[] };

/**
 * Pure dispatcher shared by the MSW handlers and the HTTP server. Both transports
 * pass the raw request body and the received headers.
 */
export type GatewayDispatch = (
  method: string,
  path: string,
  init?: GatewayRequestInit,
) => GatewayResult;
