/**
 * Named execution profiles of the chatbot Mock Model Gateway (ADR 0013,
 * ticket 02).
 *
 * A profile is the chatbot's declaration of every answer the Gateway gives
 * during a run: one explicit chat reply per model id and one explicit response
 * per non-chat operation. The official toolkit
 * (`@ai-chatbot/model-gateway-testing`) renders them; no protocol code lives in
 * this package.
 *
 * Profiles have no mutable state. A responder derives its answer from the
 * request alone (message history, parameters, prompt), so concurrent journeys
 * cannot interfere and a continuation never depends on a shared counter. An id,
 * operation or Decisions question that a profile does not declare is answered
 * by the toolkit with an explicit `422`; there is deliberately no
 * catch-all success that would hide a missing profile entry.
 */

import {
  GatewayScenarioError,
  decisionsResponse,
  embeddingsResponse,
  imageReply,
  midStreamErrorReply,
  pacedTextReply,
  reasoningReply,
  rerankResponse,
  speechResponse,
  textReply,
  toolCallReply,
  toolResultReply,
  type ChatMessage,
  type ChatReply,
  type ChatRequest,
  type DecisionsRequest,
  type EmbeddingsRequest,
  type OperationReply,
  type RerankRequest,
  type SpeechRequest,
} from "@ai-chatbot/model-gateway-testing";
import { EMBEDDING_DIMENSIONS } from "config";

// ---------------------------------------------------------------------------
// Profile API
// ---------------------------------------------------------------------------

/** Chat reply of one model id, derived from the request only. */
export type ChatResponder = (request: ChatRequest) => ChatReply;

/**
 * One Decisions answer: the criterion the profile answers a question with. A
 * function is allowed when the answer depends on the request's `state` (e.g.
 * routing that follows a marker in the message); it must never read or write
 * process-wide state.
 */
export type DecisionsAnswer = string | ((request: DecisionsRequest) => string);

/** Decisions answers keyed by the `questions` key of the request (e.g. `mode`). */
export type DecisionsAnswers = Readonly<Record<string, DecisionsAnswer>>;

/**
 * Everything one named profile declares. The catalog is owned separately
 * (`./catalog.ts`) and is identical for every profile: only the responses vary.
 */
export interface MockGatewayProfile {
  /** Stable profile name, for diagnostics and for the scenario built from it. */
  readonly name: string;
  /** Explicit chat reply per model id; ids absent here are unsupported (`422`). */
  readonly chat: Readonly<Record<string, ChatResponder>>;
  /** Explicit Decisions answer per question key; absent keys are unsupported (`422`). */
  readonly decisions: DecisionsAnswers;
  /** `embedding-default`: deterministic vectors of the Gateway's width. */
  readonly embeddings: (request: EmbeddingsRequest) => OperationReply;
  /** `rerank-default`: empty ranking, the chatbot's historical test semantics. */
  readonly rerank: (request: RerankRequest) => OperationReply;
  /** `tts-default`: deterministic WAV. */
  readonly speech: (request: SpeechRequest) => OperationReply;
}

// ---------------------------------------------------------------------------
// Deterministic fixtures the E2E assert on
// ---------------------------------------------------------------------------

/**
 * 1×1 PNG served as the `image_url` part of `image-default`. Mapped to a
 * `GeneratedFile` by `lib/infrastructure/ai/gateway-image-model.ts`.
 */
export const MOCK_IMAGE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Pacing of the `slowStream` script: one SSE frame every `SLOW_STREAM_CHUNK_MS`. */
export const SLOW_STREAM_CHUNK_MS = 350;
const SLOW_STREAM_CHUNK_COUNT = 8;

/** The deterministic, recognizable chunks the `slowStream` script emits. */
export const SLOW_STREAM_CHUNKS: string[] = Array.from(
  { length: SLOW_STREAM_CHUNK_COUNT },
  (_, index) => `SLOW chunk ${index}.`,
);

/**
 * The full text a completed `slowStream` turn renders in the UI: the chunks
 * carry no separator, and `smoothStream()` may re-split them into words but
 * never inserts characters.
 */
export const SLOW_STREAM_TEXT = SLOW_STREAM_CHUNKS.join("");

const TOOL_NAME = "webSearch";
const TOOL_ARGS = '{"query":"current weather in San Francisco"}';
const TOOL_ANSWER =
  "Based on the search results, it is 68°F and sunny in San Francisco.";
const REASONING_TEXT = "Let me think about this carefully...";
const REASONING_ANSWER = "The answer is 42.";
const REFUSAL_TEXT = "I cannot help with that request.";
const VISION_TEXT = "Image description (mock)";
const IMAGE_TEXT = "Enhanced image (mock).";
const MID_STREAM_TEXT = "Partial answer before the failure...";
const MID_STREAM_ERROR = {
  error: {
    message: "Mock mid-stream error",
    type: "server_error",
    param: null,
    code: null,
  },
};

/** Plain text of a model: the id and the request's temperature are recognizable. */
const greetingText = (model: string, temperature: number | undefined) =>
  `Hello, I'm ${model}, Temperature: ${temperature ?? 0}, `;

/** Deterministic text of a Default Model Contract (it names the contract). */
const contractText = (model: string) => `Mock response from ${model} (contract).`;

// ---------------------------------------------------------------------------
// Model ids of the internal operations (Default Model Contracts)
// ---------------------------------------------------------------------------

const FAST_CONTRACT = "fast-default";
const REASONING_CONTRACT = "reasoning-default";
const VISION_CONTRACT = "vision-default";
const IMAGE_CONTRACT = "image-default";
const EMBEDDING_CONTRACT = "embedding-default";
const RERANK_CONTRACT = "rerank-default";
const DECISION_CONTRACT = "decision-default";
const TTS_CONTRACT = "tts-default";

/** Fails explicitly when an operation is addressed by a contract the profile does not own. */
function assertContract(model: string | undefined, contract: string): void {
  if (model === contract) return;
  throw new GatewayScenarioError(
    `This gateway profile only answers the ${contract} contract (received ${model ?? "no model"})`,
    422,
    "unsupported_model",
  );
}

// ---------------------------------------------------------------------------
// `fast-default`: the internal text operations of a turn
// ---------------------------------------------------------------------------

/** Schema-valid answer of the memory query decomposition (`{ queries: string[] }`). */
const MEMORY_SEARCH_QUERIES = JSON.stringify({ queries: ["e2e memory query"] });

/**
 * Schema-valid answer of the memory fact extraction (`{ facts: [...] }`). Empty
 * on purpose: extraction is fire-and-forget after every turn, and persisted
 * facts would leak into later journeys.
 */
const MEMORY_FACTS = JSON.stringify({ facts: [] });

/** Schema-valid answer of the URL context classifier (`{ intent }`). */
const URL_INTENT = JSON.stringify({ intent: "OTHER" });

const systemPrompt = (request: ChatRequest): string => {
  const message = request.messages?.find(({ role }) => role === "system");
  return typeof message?.content === "string" ? message.content : "";
};

/**
 * The four `fast-default` operations, keyed by the system-prompt marker that
 * identifies each one on the wire. The OpenAI-compatible transport sends
 * `response_format: { type: "json_object" }` without the schema
 * (`supportsStructuredOutputs` is off in the kit), so the system prompt is the
 * only signal that identifies the operation. Each entry answers exactly what
 * the operation's schema validates.
 */
const FAST_DEFAULT_OPERATIONS: ReadonlyArray<{
  /** Substring of the system prompt that identifies the operation. */
  readonly marker: string;
  /** Schema-valid answer of the operation. */
  readonly answer: () => ChatReply;
}> = [
  // Chat title (`generateText`, plain text).
  {
    marker: "chat title generator",
    answer: () => textReply(contractText(FAST_CONTRACT)),
  },
  // Memory retrieval query decomposition (`Output.object`).
  {
    marker: "optimize memory retrieval",
    answer: () => textReply(MEMORY_SEARCH_QUERIES),
  },
  // Memory fact extraction (`Output.object`).
  { marker: "extracts persistent facts", answer: () => textReply(MEMORY_FACTS) },
  // URL context classifier (`generateObject`).
  { marker: "intent classification engine", answer: () => textReply(URL_INTENT) },
];

function fastDefaultReply(request: ChatRequest): ChatReply {
  const system = systemPrompt(request);
  const operation = FAST_DEFAULT_OPERATIONS.find(({ marker }) =>
    system.includes(marker),
  );

  if (operation === undefined) {
    throw new GatewayScenarioError(
      "The e2e profile does not know this fast-default operation",
      422,
      "unsupported_operation",
    );
  }

  return operation.answer();
}

// ---------------------------------------------------------------------------
// Chat replies, one per model id
// ---------------------------------------------------------------------------

/** A tool result (`role: "tool"`) means the second and final turn. */
const isToolResult = (message: ChatMessage | undefined): boolean =>
  message?.role === "tool";

/**
 * Chat replies of the `e2e` profile, keyed by catalog id. Every id is listed
 * explicitly so a request for an unlisted id (e.g. a contract without a
 * consumer yet) is answered by the toolkit's `422 unsupported_model`.
 */
const E2E_CHAT_REPLIES: Readonly<Record<string, ChatResponder>> = {
  basicChat: (request) => textReply(greetingText("basicChat", request.temperature)),

  basicChatAlt: (request) =>
    textReply(greetingText("basicChatAlt", request.temperature)),

  /**
   * Two turns derived from the REQUEST HISTORY: with a `role: "tool"` message
   * it answers the final text, without one it asks for the tool call.
   */
  canExecuteTools: (request) =>
    isToolResult(request.messages?.at(-1))
      ? toolResultReply(TOOL_ANSWER)
      : {
          ...toolCallReply({
            calls: [{ id: "call-1", name: TOOL_NAME, arguments: TOOL_ARGS }],
          }),
          // Without streaming the mock answers with the final text directly.
          json: TOOL_ANSWER,
        },

  canSeeImages: () => textReply(VISION_TEXT),

  canProduceReasoning: () =>
    reasoningReply({ reasoning: REASONING_TEXT, text: REASONING_ANSWER }),

  alwaysRefuses: () => textReply(REFUSAL_TEXT),

  failsMidStream: () => ({
    ...midStreamErrorReply({ text: MID_STREAM_TEXT, error: MID_STREAM_ERROR }),
    // The JSON path never aborts: plain text instead of the error cut.
    json: contractText("failsMidStream"),
  }),

  slowStream: () =>
    pacedTextReply({ chunks: SLOW_STREAM_CHUNKS, delayMs: SLOW_STREAM_CHUNK_MS }),

  [FAST_CONTRACT]: fastDefaultReply,

  // Compaction summarisation: plain text, chosen by whether the turn has files.
  [REASONING_CONTRACT]: () => textReply(contractText(REASONING_CONTRACT)),
  [VISION_CONTRACT]: () => textReply(contractText(VISION_CONTRACT)),

  [IMAGE_CONTRACT]: () =>
    imageReply({
      text: IMAGE_TEXT,
      base64: MOCK_IMAGE_PNG_BASE64,
      mediaType: "image/png",
    }),
};

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/**
 * Renders the profile's declared Decisions answers for the questions the
 * request asks. The profile names the criterion per question; a question
 * without a declared answer, or an answer that is not one of the question's
 * criteria, is an explicit scenario error instead of an implicit
 * first-criterion answer.
 */
export function decisionsReply(
  decisions: DecisionsAnswers,
  request: DecisionsRequest,
): OperationReply {
  assertContract(request.model, DECISION_CONTRACT);

  const questions = Object.entries(request.questions ?? {});
  if (questions.length === 0) {
    throw new GatewayScenarioError(
      "The Decisions request has no questions",
      422,
      "unsupported_operation",
    );
  }

  const choices: Record<string, string> = {};
  for (const [name, question] of questions) {
    const declared = decisions[name];
    if (declared === undefined) {
      throw new GatewayScenarioError(
        `This gateway profile does not declare a Decisions answer for "${name}"`,
        422,
        "unsupported_question",
      );
    }
    const choice = typeof declared === "function" ? declared(request) : declared;
    if (!(choice in (question.criteria ?? {}))) {
      throw new GatewayScenarioError(
        `This gateway profile answers "${name}" with "${choice}", which is not one of its criteria`,
        422,
        "unsupported_choice",
      );
    }
    choices[name] = choice;
  }

  return decisionsResponse(request, { choices });
}

// ---------------------------------------------------------------------------
// Non-chat operations
// ---------------------------------------------------------------------------

const embeddings = (request: EmbeddingsRequest): OperationReply => {
  assertContract(request.model, EMBEDDING_CONTRACT);
  return embeddingsResponse(request, { dimensions: EMBEDDING_DIMENSIONS });
};

const rerank = (request: RerankRequest): OperationReply => {
  assertContract(request.model, RERANK_CONTRACT);
  // Empty ranking: hybrid search behaves as pure vector search, as it always
  // has in the Test Environment.
  return rerankResponse(request);
};

const speech = (request: SpeechRequest): OperationReply => {
  assertContract(request.model, TTS_CONTRACT);
  return speechResponse(request);
};

// ---------------------------------------------------------------------------
// The profiles the harness can serve
// ---------------------------------------------------------------------------

/**
 * The profile the canonical `:4001` mock serves. A journey that needs different
 * answers must derive them from the request (history, temperature, prompt) or
 * introduce another NAMED profile here; the running mock is never reconfigured
 * between tests because the application caches the catalog and two journeys
 * would interfere.
 */
export const E2E_PROFILE: MockGatewayProfile = {
  name: "e2e",
  chat: E2E_CHAT_REPLIES,
  decisions: {
    /**
     * Chat Mode Routing (`mode` is `CHAT_MODE_ROUTING_QUESTION_KEY` in
     * `lib/features/chat/mode-routing/router.ts`). `ctx7` is the routing
     * question's first criterion and resolves to the `context7` Chat Mode, the
     * answer every routed E2E journey expects; a journey that must route
     * elsewhere declares another criterion here (or a function of the request).
     */
    mode: "ctx7",
  },
  embeddings,
  rerank,
  speech,
};
