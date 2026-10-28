/**
 * Mock Model Gateway (ADR 0010, ADR 0013) — stands in for the real Gateway in the
 * Test Environment (`MODEL_GATEWAY_URL=http://127.0.0.1:4001`).
 *
 * The reusable protocol/lifecycle mechanisms live in the official testing toolkit
 * `@ai-chatbot/model-gateway-testing`; this file is the chatbot's thin consumer:
 * it owns the test catalog (`./catalog.ts`), the ids that ARE capabilities, the
 * per-model reply scripts and the canonical `:4001` process lifecycle.
 * `ensureMockGateway`/`stopMockGateway` are the idempotent, cross-process
 * ensure/stop strategy described in the toolkit's README.
 */

import {
  HEALTH_PATH,
  createGatewayScenario,
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
} from "@ai-chatbot/model-gateway-testing";
import {
  startGatewayServer,
  type GatewayServer,
} from "@ai-chatbot/model-gateway-testing/server";
import { EMBEDDING_DIMENSIONS } from "config";
import { TEST_INTERNAL_MODELS, TEST_MODELS } from "./catalog";

export const MOCK_GATEWAY_PORT = 4001;

// ---------------------------------------------------------------------------
// Consumer-owned scenario fixtures
// ---------------------------------------------------------------------------

/** Deterministic "generic mock" text: it includes the id and the temperature. */
const basicText = (model: string, temperature: number | undefined) =>
  `Hello, I'm ${model}, Temperature: ${temperature ?? 0}, `;

/**
 * `canExecuteTools` is a two-turn script derived from the REQUEST HISTORY: with a
 * `role: "tool"` message it answers with the final text, without one it asks for
 * the tool call. There is no first/second-call counter, so concurrent or repeated
 * requests cannot drift.
 */
function isToolResult(message: ChatMessage | undefined): boolean {
  return message?.role === "tool";
}

const TOOL_NAME = "webSearch";
const TOOL_ARGS = '{"query":"current weather in San Francisco"}';
const TOOL_ANSWER = "Based on the search results, it is 68°F and sunny in San Francisco.";
const REASONING_TEXT = "Let me think about this carefully...";
const REASONING_ANSWER = "The answer is 42.";
const REFUSAL_TEXT = "I cannot help with that request.";
const VISION_TEXT = "Image description (mock)";
const IMAGE_TEXT = "Enhanced image (mock).";

/**
 * 1×1 PNG that the mock serves as the `image_url` part of `image-default` (same
 * bytes as the old image mock). Mapped to `GeneratedFile` by
 * `lib/infrastructure/ai/gateway-image-model.ts`.
 */
export const MOCK_IMAGE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const MID_STREAM_TEXT = "Partial answer before the failure...";
const MID_STREAM_ERROR = {
  error: {
    message: "Mock mid-stream error",
    type: "server_error",
    param: null,
    code: null,
  },
};

/** Pacing of the `slowStream` script: a chunk every `SLOW_STREAM_CHUNK_MS`. */
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

/** Simple deterministic response for the `*-default` contracts (includes the name). */
const contractText = (model: string) => `Mock response from ${model} (contract).`;

/**
 * Reply script per model id — the cascade on the id lives HERE, once. Streaming
 * and non-streaming are two renderings of the same reply (the toolkit renders
 * both from one description).
 */
function chatReply(request: ChatRequest): ChatReply {
  const model = request.model ?? "basicChat";
  const last = request.messages?.at(-1);

  switch (model) {
    case "failsMidStream":
      return {
        ...midStreamErrorReply({ text: MID_STREAM_TEXT, error: MID_STREAM_ERROR }),
        // The JSON path never aborts: generic contract text.
        json: contractText(model),
      };

    case "canExecuteTools":
      // Two turns: without a tool result → tool_calls; with it → final text.
      return isToolResult(last)
        ? toolResultReply(TOOL_ANSWER)
        : {
            ...toolCallReply({
              calls: [{ id: "call-1", name: TOOL_NAME, arguments: TOOL_ARGS }],
            }),
            // Without streaming the mock answers with the final text directly.
            json: TOOL_ANSWER,
          };

    case "canProduceReasoning":
      return reasoningReply({ reasoning: REASONING_TEXT, text: REASONING_ANSWER });

    case "slowStream":
      return pacedTextReply({
        chunks: SLOW_STREAM_CHUNKS,
        delayMs: SLOW_STREAM_CHUNK_MS,
      });

    case "image-default":
      return imageReply({
        text: IMAGE_TEXT,
        base64: MOCK_IMAGE_PNG_BASE64,
        mediaType: "image/png",
      });

    case "basicChat":
    case "basicChatAlt":
      return textReply(basicText(model, request.temperature));

    case "canSeeImages":
      return textReply(VISION_TEXT);

    case "alwaysRefuses":
      return textReply(REFUSAL_TEXT);

    default:
      return textReply(contractText(model));
  }
}

/**
 * The chatbot's gateway scenario: MSW handlers bound to this catalog and these
 * responders (for in-process social unit tests) plus the dispatcher the HTTP
 * server reuses. Exported so a test can observe the recorded requests.
 */
export const mockGatewayScenario = createGatewayScenario({
  catalog: { public: TEST_MODELS, internal: TEST_INTERNAL_MODELS },
  chat: chatReply,
  embeddings: (request) => embeddingsResponse(request, { dimensions: EMBEDDING_DIMENSIONS }),
  rerank: (request) => rerankResponse(request),
  decisions: (request) => decisionsResponse(request),
  speech: (request) => speechResponse(request),
});

// ---------------------------------------------------------------------------
// Canonical `:4001` process lifecycle (chatbot-owned)
// ---------------------------------------------------------------------------

export interface MockGatewayHandle {
  port: number;
  /** false if the port already had a mock listening and it was reused. */
  started: boolean;
}

let running: { server: GatewayServer; port: number } | undefined;

const probeTimeoutMs = 500;
const ensureTimeoutMs = 10_000;

/** Is a Mock Model Gateway (this same mock) already listening on the port? */
export async function isMockGatewayAlive(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${HEALTH_PATH}`, {
      signal: AbortSignal.timeout(probeTimeoutMs),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { mock?: string };
    return body.mock === "model-gateway";
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Guarantees a mock listening on `port`, idempotent and safe against concurrent
 * processes:
 * 1. if this process already has one, it reuses it;
 * 2. if ANOTHER process already serves the mock (probe to the health endpoint),
 *    it reuses it;
 * 3. otherwise it listens on the port; if it loses the race (EADDRINUSE), it
 *    waits for the winner to be probeable and reuses it.
 */
export async function ensureMockGateway(
  options: { port?: number } = {},
): Promise<MockGatewayHandle> {
  const port = options.port ?? MOCK_GATEWAY_PORT;
  if (running?.port === port) return { port, started: false };

  if (await isMockGatewayAlive(port)) return { port, started: false };

  const deadline = Date.now() + ensureTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const server = await startGatewayServer(mockGatewayScenario, {
        port,
        host: "127.0.0.1",
      });
      running = { server, port: server.port };
      return { port: server.port, started: true };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE") throw error;
      // Another process won the port: wait until its mock is probeable.
      if (await isMockGatewayAlive(port)) return { port, started: false };
      await sleep(100);
    }
  }
  throw new Error(
    `ensureMockGateway: port ${port} is still busy without a probeable mock after ${ensureTimeoutMs}ms`,
  );
}

/** Closes THIS process's mock (other processes' mocks do not belong to us). */
export async function stopMockGateway(): Promise<void> {
  if (!running) return;
  const { server } = running;
  running = undefined;
  await server.close();
}
