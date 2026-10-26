import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { EMBEDDING_DIMENSIONS } from "config";
import { TEST_INTERNAL_MODELS, TEST_MODELS, type MockCatalogEntry } from "./catalog";

/**
 * Mock Model Gateway (ADR 0010, ticket 02) — stands in for the real Gateway in
 * the Test Environment (`MODEL_GATEWAY_URL=http://127.0.0.1:4001` in `.env.test`).
 *
 * Pure Node HTTP server (`node:http`), no dependencies: same surface as LiteLLM
 * Proxy (shared contract §4) with deterministic responses. The test catalog is
 * defined directly by capabilities — see catalog.ts.
 */

export const MOCK_GATEWAY_PORT = 4001;

/** Probe route for `ensureMockGateway`: it only exists in this server. */
const HEALTH_PATH = "/__mock-gateway/health";

interface ChatMessage {
  role: string;
  content?: unknown;
}

interface ChatRequest {
  model?: string;
  stream?: boolean;
  temperature?: number;
  messages?: ChatMessage[];
}

// ---------------------------------------------------------------------------
// HTTP utilities
// ---------------------------------------------------------------------------

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseJson(body: string): Record<string, unknown> | undefined {
  if (!body) return undefined;
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Bearer required on every route: 401 without the header (catches misconfiguration). */
function requireAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (typeof req.headers.authorization === "string" && req.headers.authorization.length > 0) {
    return true;
  }
  sendJson(res, 401, {
    error: { message: "Missing Authorization header", type: "auth_error", code: "unauthorized" },
  });
  return false;
}

// ---------------------------------------------------------------------------
// Chat completions (OpenAI-compatible)
// ---------------------------------------------------------------------------

const COMPLETION_ID = "chatcmpl-mock-gateway";

interface ChatChunkDelta {
  role?: "assistant";
  content?: string | unknown[];
  reasoning_content?: string;
  tool_calls?: Array<{
    index: number;
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

function sseChunk(delta: ChatChunkDelta, finishReason?: string, model?: string): string {
  const payload = {
    id: COMPLETION_ID,
    object: "chat.completion.chunk",
    created: 1_700_000_000,
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

const SSE_DONE = "data: [DONE]\n\n";

function startSse(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
}

/** JSON (no streaming) of a chat completion. */
function completionJson(
  text: string,
  model: string,
  content?: string | unknown[],
): unknown {
  return {
    id: COMPLETION_ID,
    object: "chat.completion",
    created: 1_700_000_000,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: content ?? text },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 3, completion_tokens: 10, total_tokens: 13 },
  };
}

/** Deterministic "generic mock" text: it includes the id and the temperature. */
const basicText = (model: string, temperature: number | undefined) =>
  `Hello, I'm ${model}, Temperature: ${temperature ?? 0}, `;

/**
 * `canExecuteTools` is equivalent to the current two-turn mock (doStream in
 * sequence): first request (no tool result) → tool_calls; second one (the last
 * message is already a `role: "tool"`) → final text.
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
const IMAGE_DATA_URL = `data:image/png;base64,${MOCK_IMAGE_PNG_BASE64}`;

/** OpenAI parts of an image-contract response: text + image. */
const imageContentParts = () => [
  { type: "text", text: IMAGE_TEXT },
  { type: "image_url", image_url: { url: IMAGE_DATA_URL } },
];
const MID_STREAM_TEXT = "Partial answer before the failure...";
const MID_STREAM_ERROR = {
  error: {
    message: "Mock mid-stream error",
    type: "server_error",
    param: null,
    code: null,
  },
};

/**
 * `failsMidStream` no longer needs its own helper: its script lives in
 * `chatScript` (it emits text and cuts with a `data: {"error": …}` event without
 * `[DONE]`; the openai-compatible provider parses it into a `{ type: "error" }`
 * part with finishReason "error").
 */

/**
 * One step of the chat script: an SSE delta (with its optional finish_reason)
 * or, in the `failsMidStream` case, the error that cuts the stream without
 * `[DONE]`. `delayMs` paces the streaming rendering only (the JSON path
 * returns the whole script at once): `streamScript` awaits that long before
 * writing the step, so a scenario can cut the connection while the turn is
 * still generating (e2e resume suite).
 */
interface ChatStep {
  delta?: ChatChunkDelta;
  finishReason?: string;
  abortWithError?: unknown;
  delayMs?: number;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 * Script of a chat completion per model id — the cascade on the id lives HERE,
 * once; the streaming and non-streaming paths are just two renderings of the
 * same script (see `streamScript`/`jsonScript`).
 */
function chatScript(body: ChatRequest): {
  model: string;
  steps: ChatStep[];
  /** Full message content for the non-streaming path (JSON). */
  jsonContent: string | unknown[];
} {
  const model = body.model ?? "basicChat";
  const last = body.messages?.at(-1);

  switch (model) {
    case "failsMidStream":
      return {
        model,
        steps: [
          { delta: { role: "assistant", content: MID_STREAM_TEXT } },
          { delta: {}, abortWithError: MID_STREAM_ERROR },
        ],
        // The JSON path never aborts: generic contract text.
        jsonContent: contractText(model),
      };

    case "canExecuteTools":
      // Two turns: without a tool result → tool_calls; with it → final text.
      return isToolResult(last)
        ? {
            model,
            steps: [
              { delta: { role: "assistant", content: TOOL_ANSWER } },
              { delta: {}, finishReason: "stop" },
            ],
            jsonContent: TOOL_ANSWER,
          }
        : {
            model,
            steps: [
              { delta: { role: "assistant" } },
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call-1",
                      type: "function",
                      function: { name: TOOL_NAME, arguments: TOOL_ARGS },
                    },
                  ],
                },
              },
              { delta: {}, finishReason: "tool_calls" },
            ],
            // Without streaming the mock answers with the final text directly.
            jsonContent: TOOL_ANSWER,
          };

    case "canProduceReasoning":
      return {
        model,
        steps: [
          { delta: { role: "assistant" } },
          { delta: { reasoning_content: REASONING_TEXT } },
          { delta: { content: REASONING_ANSWER } },
          { delta: {}, finishReason: "stop" },
        ],
        jsonContent: REASONING_ANSWER,
      };

    case "slowStream":
      return {
        model,
        steps: [
          { delta: { role: "assistant" }, delayMs: SLOW_STREAM_CHUNK_MS },
          ...SLOW_STREAM_CHUNKS.map((text) => ({
            delta: { content: text },
            delayMs: SLOW_STREAM_CHUNK_MS,
          })),
          { delta: {}, finishReason: "stop", delayMs: SLOW_STREAM_CHUNK_MS },
        ],
        jsonContent: SLOW_STREAM_TEXT,
      };

    case "image-default":
      return {
        model,
        steps: [
          { delta: { role: "assistant", content: imageContentParts() } },
          { delta: {}, finishReason: "stop" },
        ],
        jsonContent: imageContentParts(),
      };

    default: {
      const text =
        model === "basicChat" || model === "basicChatAlt"
          ? basicText(model, body.temperature)
          : model === "canSeeImages"
            ? VISION_TEXT
            : model === "alwaysRefuses"
              ? REFUSAL_TEXT
              : contractText(model);
      return {
        model,
        steps: [
          { delta: { role: "assistant", content: text } },
          { delta: {}, finishReason: "stop" },
        ],
        jsonContent: text,
      };
    }
  }
}

/**
 * Renders the script as OpenAI SSE. Paced: a step with `delayMs` is written
 * only after awaiting that long, so a `slowStream` turn lasts several seconds
 * and is still alive mid-scenario. Everything else stays as before: all steps
 * without `delayMs` are written in one tick.
 */
async function streamScript(res: ServerResponse, body: ChatRequest): Promise<void> {
  startSse(res);
  const script = chatScript(body);
  for (const step of script.steps) {
    if (step.delayMs !== undefined) {
      await delay(step.delayMs);
    }
    if (step.abortWithError !== undefined) {
      res.write(`data: ${JSON.stringify(step.abortWithError)}\n\n`);
      res.end();
      return;
    }
    res.write(sseChunk(step.delta ?? {}, step.finishReason, script.model));
  }
  res.write(SSE_DONE);
  res.end();
}

/** Renders the script as non-streaming JSON. */
function jsonScript(res: ServerResponse, body: ChatRequest): void {
  const script = chatScript(body);
  sendJson(res, 200, completionJson("", script.model, script.jsonContent));
}

/** Simple deterministic response for the `*-default` contracts (includes the name). */
const contractText = (model: string) => `Mock response from ${model} (contract).`;

async function handleChatCompletions(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAuth(req, res)) return;
  const body = (parseJson(await readBody(req)) ?? {}) as ChatRequest;
  if (body.stream) {
    await streamScript(res, body);
    return;
  }
  jsonScript(res, body);
}

// ---------------------------------------------------------------------------
// Embeddings / Rerank / Decisions / Speech
// ---------------------------------------------------------------------------


/**
 * Deterministic vector derived from the text (FNV-1a per position): same inputs
 * → same values, with no external seed needed.
 */
function deterministicEmbedding(text: string): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i += 1) {
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

async function handleEmbeddings(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAuth(req, res)) return;
  const body = (parseJson(await readBody(req)) ?? {}) as {
    input?: string | string[];
    model?: string;
  };
  const inputs = Array.isArray(body.input) ? body.input : [body.input ?? ""];
  const model = body.model ?? "embedding-default";
  sendJson(res, 200, {
    object: "list",
    model,
    data: inputs.map((input, index) => ({
      object: "embedding",
      index,
      embedding: deterministicEmbedding(input),
    })),
    usage: { prompt_tokens: 10, total_tokens: 10 },
  });
}

/**
 * Deliberately EMPTY ranking: it replicates the chatbot's current test semantics
 * (`createMockRerankModel` in `packages/inference/src/testing/rerank.ts` always
 * returns `ranking: []`), so hybrid search behaves in test like pure vector
 * without rerank and no test changes its result.
 */
async function handleRerank(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAuth(req, res)) return;
  const body = (parseJson(await readBody(req)) ?? {}) as { model?: string };
  sendJson(res, 200, { model: body.model ?? "rerank-default", results: [] });
}

/**
 * Decisions API (TypeSafe/SystemOne): for each `choice` question it answers with
 * the first declared criterion (deterministic), confidence 1 and probabilities
 * uniform across the criteria. Alias `/v1/systemone` → same handler.
 */
async function handleDecisions(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAuth(req, res)) return;
  const body = (parseJson(await readBody(req)) ?? {}) as {
    model?: string;
    questions?: Record<string, { type?: string; criteria?: Record<string, unknown> }>;
  };
  const model = body.model ?? "decision-default";
  const answers: Record<
    string,
    { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  > = {};
  for (const [name, question] of Object.entries(body.questions ?? {})) {
    const options = Object.keys(question.criteria ?? {});
    if (question.type !== "choice" || options.length === 0) continue;
    const uniform = 1 / options.length;
    answers[name] = {
      type: "choice",
      choice: options[0]!,
      confidence: 1,
      probabilities: Object.fromEntries(options.map((option) => [option, uniform])),
    };
  }
  sendJson(res, 200, {
    answers,
    model,
    provider: "mock-model-gateway",
    usage: { cost: 0 },
  });
}

/**
 * Minimal WAV (44-byte header + deterministic 800-sample PCM) with the
 * `audio/mpeg` Content-Type that the `/v1/audio/speech` contract pins — the exact
 * bytes do not matter to the consumers (only that the audio is valid and stable
 * across runs).
 */
function deterministicWav(input: string): Buffer {
  const samples = 800;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const amplitude = ((input.charCodeAt(i % input.length) + i) % 128) - 64;
    data.writeInt16LE(amplitude * 96, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(8000, 24); // sample rate
  header.writeUInt32LE(16000, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function handleSpeech(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAuth(req, res)) return;
  const body = (parseJson(await readBody(req)) ?? {}) as { input?: string };
  const audio = deterministicWav(body.input ?? "");
  res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": audio.length });
  res.end(audio);
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

function handleCatalog(req: IncomingMessage, res: ServerResponse): void {
  if (!requireAuth(req, res)) return;
  // Only the literal value "true" enables the internal view: `has("include_internal")`
  // treated ?include_internal=false as true (review bug).
  const includeInternal =
    new URL(req.url ?? "/", "http://localhost").searchParams.get("include_internal") === "true";
  const models: MockCatalogEntry[] = includeInternal
    ? [...TEST_MODELS, ...TEST_INTERNAL_MODELS]
    : TEST_MODELS;
  sendJson(res, 200, { models });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function route(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (req.method === "GET" && path === HEALTH_PATH) {
    sendJson(res, 200, { mock: "model-gateway" });
    return;
  }
  if (req.method === "GET" && path === "/v1/models/catalog") {
    handleCatalog(req, res);
    return;
  }
  if (req.method === "POST" && path === "/v1/chat/completions") {
    void handleChatCompletions(req, res);
    return;
  }
  if (req.method === "POST" && path === "/v1/embeddings") {
    void handleEmbeddings(req, res);
    return;
  }
  if (req.method === "POST" && path === "/v1/rerank") {
    void handleRerank(req, res);
    return;
  }
  if (req.method === "POST" && (path === "/v1/decisions" || path === "/v1/systemone")) {
    void handleDecisions(req, res);
    return;
  }
  if (req.method === "POST" && path === "/v1/audio/speech") {
    void handleSpeech(req, res);
    return;
  }
  sendJson(res, 404, { error: { message: `Unknown route: ${req.method} ${path}` } });
}

export interface MockGatewayHandle {
  port: number;
  /** false if the port already had a mock listening and it was reused. */
  started: boolean;
}

interface RunningGateway {
  server: Server;
  port: number;
}

let running: RunningGateway | undefined;

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

  const server = createServer(route);
  const deadline = Date.now() + ensureTimeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
      // With `port: 0` (ephemeral, for tests that want their own server without
      // races between workers) we report the REAL port assigned by the OS.
      const boundPort =
        port === 0
          ? (server.address() as { port: number }).port
          : port;
      running = { server, port: boundPort };
      return { port: boundPort, started: true };
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
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
