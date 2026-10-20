import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { TEST_INTERNAL_MODELS, TEST_MODELS, type MockCatalogEntry } from "./catalog";

/**
 * Mock Model Gateway (ADR 0010, ticket 02) — suplanta al Gateway real en el
 * Entorno de Test (`MODEL_GATEWAY_URL=http://127.0.0.1:4001` en `.env.test`).
 *
 * Servidor HTTP Node puro (`node:http`), sin dependencias: misma superficie
 * que LiteLLM Proxy (contrato compartido §4) con respuestas deterministas.
 * El catálogo de test se define directamente por capacidades — ver catalog.ts.
 */

export const MOCK_GATEWAY_PORT = 4001;

/** Ruta de sonda para `ensureMockGateway`: solo existe en este servidor. */
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
// Utilidades HTTP
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

/** Bearer requerido en todas las rutas: 401 sin header (detecta misconfiguración). */
function isAuthenticated(req: IncomingMessage): boolean {
  return typeof req.headers.authorization === "string" && req.headers.authorization.length > 0;
}

const unauthorized = (res: ServerResponse, body: unknown) => sendJson(res, 401, body);

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

/** JSON (no streaming) de un chat completion. */
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

/** Texto determinista de tipo "mock genérico": incluye el id y la temperature. */
const basicText = (model: string, temperature: number | undefined) =>
  `Hello, I'm ${model}, Temperature: ${temperature ?? 0}, `;

/**
 * `canExecuteTools` equivale al mock actual de dos turnos (doStream en Secuencia):
 * primer request (sin resultado de tool) → tool_calls; segundo (el último
 * mensaje ya es un `role: "tool"`) → texto final.
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
 * PNG de 1×1 que el mock sirve como parte `image_url` de `image-default`
 * (mismo bytes que el antiguo mock de imagen). Mapeado a `GeneratedFile` por
 * `lib/infrastructure/ai/gateway-image-model.ts`.
 */
export const MOCK_IMAGE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const IMAGE_DATA_URL = `data:image/png;base64,${MOCK_IMAGE_PNG_BASE64}`;

/** Partes OpenAI de una respuesta del contrato de imagen: texto + imagen. */
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
 * Emite un trozo de texto y CORTA el stream con un evento `data: {"error": ...}`:
 * el provider openai-compatible parsea ese chunk vía su errorSchema y lo
 * traduce a una parte `{ type: "error" }` de stream (finishReason "error"),
 * la misma forma que hoy produce el `MOCK_MID_STREAM_ERROR` en memoria y la
 * que `packages/chatbot/lib/features/chat` propaga a la UI como `onError`.
 * Sin `[DONE]`: el stream termina abruptamente tras el error.
 */
function streamFailsMidStream(res: ServerResponse, model: string): void {
  res.write(sseChunk({ role: "assistant", content: MID_STREAM_TEXT }, undefined, model));
  res.write(`data: ${JSON.stringify(MID_STREAM_ERROR)}\n\n`);
  res.end();
}

function streamChat(res: ServerResponse, body: ChatRequest): void {
  startSse(res);
  const model = body.model ?? "basicChat";
  const last = body.messages?.at(-1);

  // --- failsMidStream: error tras el primer trozo ---
  if (model === "failsMidStream") {
    streamFailsMidStream(res, model);
    return;
  }

  // --- canExecuteTools: dos turnos ---
  if (model === "canExecuteTools") {
    if (!isToolResult(last)) {
      res.write(sseChunk({ role: "assistant" }, undefined, model));
      res.write(
        sseChunk(
          {
            tool_calls: [
              {
                index: 0,
                id: "call-1",
                type: "function",
                function: { name: TOOL_NAME, arguments: TOOL_ARGS },
              },
            ],
          },
          undefined,
          model,
        ),
      );
      res.write(sseChunk({}, "tool_calls", model));
      res.write(SSE_DONE);
      res.end();
      return;
    }
    res.write(sseChunk({ role: "assistant", content: TOOL_ANSWER }, undefined, model));
    res.write(sseChunk({}, "stop", model));
    res.write(SSE_DONE);
    res.end();
    return;
  }

  // --- canProduceReasoning: reasoning_content + texto ---
  if (model === "canProduceReasoning") {
    res.write(sseChunk({ role: "assistant" }, undefined, model));
    res.write(sseChunk({ reasoning_content: REASONING_TEXT }, undefined, model));
    res.write(sseChunk({ content: REASONING_ANSWER }, undefined, model));
    res.write(sseChunk({}, "stop", model));
    res.write(SSE_DONE);
    res.end();
    return;
  }

  // --- image-default: contenido multipart (texto + imagen) ---
  if (model === "image-default") {
    res.write(
      sseChunk(
        { role: "assistant", content: imageContentParts() },
        undefined,
        model,
      ),
    );
    res.write(sseChunk({}, "stop", model));
    res.write(SSE_DONE);
    res.end();
    return;
  }

  // --- Resto: texto determinista ---
  const text =
    model === "basicChat" || model === "basicChatAlt"
      ? basicText(model, body.temperature)
      : model === "canSeeImages"
        ? VISION_TEXT
        : model === "alwaysRefuses"
          ? REFUSAL_TEXT
          : contractText(model);
  res.write(sseChunk({ role: "assistant", content: text }, undefined, model));
  res.write(sseChunk({}, "stop", model));
  res.write(SSE_DONE);
  res.end();
}

/** Respuesta determinista simple para los contratos `*-default` (incluye el nombre). */
const contractText = (model: string) => `Mock response from ${model} (contract).`;

async function handleChatCompletions(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isAuthenticated(req)) {
    unauthorized(res, {
      error: { message: "Missing Authorization header", type: "auth_error", code: "unauthorized" },
    });
    return;
  }
  const body = (parseJson(await readBody(req)) ?? {}) as ChatRequest;
  if (body.stream) {
    streamChat(res, body);
    return;
  }
  const model = body.model ?? "basicChat";
  const last = body.messages?.at(-1);
  if (model === "image-default") {
    sendJson(res, 200, completionJson("", model, imageContentParts()));
    return;
  }
  const text =
    model === "canExecuteTools" && !isToolResult(last)
      ? TOOL_ANSWER
      : model === "canSeeImages"
        ? VISION_TEXT
        : model === "alwaysRefuses"
          ? REFUSAL_TEXT
          : model === "canProduceReasoning"
            ? REASONING_ANSWER
            : model === "basicChat" || model === "basicChatAlt"
              ? basicText(model, body.temperature)
              : contractText(model);
  sendJson(res, 200, completionJson(text, model));
}

// ---------------------------------------------------------------------------
// Embeddings / Rerank / Decisions / Speech
// ---------------------------------------------------------------------------

const EMBEDDING_DIMENSIONS = 768;

/**
 * Vector determinista derivado del texto (FNV-1a por posición): mismos inputs
 * → mismos valores, sin necesidad de seed externo.
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
    // Normalizado a [-1, 1] con signo estable.
    embedding.push(((hash >>> 0) % 2000 - 1000) / 1000);
  }
  return embedding;
}

async function handleEmbeddings(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isAuthenticated(req)) {
    unauthorized(res, {
      error: { message: "Missing Authorization header", type: "auth_error", code: "unauthorized" },
    });
    return;
  }
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
 * Ranking VACÍO a propósito: replica la semántica de test actual del chatbot
 * (`createMockRerankModel` en `packages/inference/src/testing/rerank.ts`
 * devuelve `ranking: []` siempre), de modo que hybrid search se comporta en
 * test como vector-puro sin rerank y ningún test cambia de resultado.
 */
async function handleRerank(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isAuthenticated(req)) {
    unauthorized(res, {
      error: { message: "Missing Authorization header", type: "auth_error", code: "unauthorized" },
    });
    return;
  }
  const body = (parseJson(await readBody(req)) ?? {}) as { model?: string };
  sendJson(res, 200, { model: body.model ?? "rerank-default", results: [] });
}

/**
 * Decisions API (TypeSafe/SystemOne): para cada pregunta `choice` responde con
 * el primer criterio declarado (determinista), confianza 1 y probabilidades
 * uniformes entre los criterios. Alias `/v1/systemone` → mismo handler.
 */
async function handleDecisions(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isAuthenticated(req)) {
    unauthorized(res, {
      error: { message: "Missing Authorization header", type: "auth_error", code: "unauthorized" },
    });
    return;
  }
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
 * WAV mínimo (header de 44 bytes + PCM determinista de 800 muestras) con el
 * Content-Type `audio/mpeg` que fija el contrato de `/v1/audio/speech` — los
 * bytes exactos no importan para los consumers (solo que haya audio válido y
 * estable entre corridas).
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
  header.writeUInt32LE(16, 16); // tamaño del chunk fmt
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(8000, 24); // sample rate
  header.writeUInt32LE(16000, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits por muestra
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function handleSpeech(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isAuthenticated(req)) {
    unauthorized(res, {
      error: { message: "Missing Authorization header", type: "auth_error", code: "unauthorized" },
    });
    return;
  }
  const body = (parseJson(await readBody(req)) ?? {}) as { input?: string };
  const audio = deterministicWav(body.input ?? "");
  res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": audio.length });
  res.end(audio);
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

function handleCatalog(req: IncomingMessage, res: ServerResponse): void {
  if (!isAuthenticated(req)) {
    unauthorized(res, { error: "unauthorized" });
    return;
  }
  // Solo el valor literal "true" activa la vista interna: `has("include_internal")`
  // trataba ?include_internal=false como true (bug de la revisión).
  const includeInternal =
    new URL(req.url ?? "/", "http://localhost").searchParams.get("include_internal") === "true";
  const models: MockCatalogEntry[] = includeInternal
    ? [...TEST_MODELS, ...TEST_INTERNAL_MODELS]
    : TEST_MODELS;
  sendJson(res, 200, { models });
}

// ---------------------------------------------------------------------------
// Servidor
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
  /** false si el puerto ya tenía un mock escuchando y se reutilizó. */
  started: boolean;
}

interface RunningGateway {
  server: Server;
  port: number;
}

let running: RunningGateway | undefined;

const probeTimeoutMs = 500;
const ensureTimeoutMs = 10_000;

/** ¿Hay un Mock Model Gateway (este mismo mock) ya escuchando en el puerto? */
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
 * Garantiza un mock escuchando en `port`, idempotente y seguro frente a
 * procesos concurrentes:
 * 1. si este proceso ya tiene uno, lo reutiliza;
 * 2. si OTRO proceso ya sirve el mock (sonda al health endpoint), lo reutiliza;
 * 3. si no, escucha en el puerto; si pierde la carrera (EADDRINUSE), espera a
 *    que el ganador esté sondeable y lo reutiliza.
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
      // Con `port: 0` (efímero, para tests que quieren un server propio sin
      // carreras entre workers) reportamos el puerto REAL asignado por el SO.
      const boundPort =
        port === 0
          ? (server.address() as { port: number }).port
          : port;
      running = { server, port: boundPort };
      return { port: boundPort, started: true };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE") throw error;
      // Otro proceso ganó el puerto: esperar a que su mock sea sondeable.
      if (await isMockGatewayAlive(port)) return { port, started: false };
      await sleep(100);
    }
  }
  throw new Error(
    `ensureMockGateway: el puerto ${port} sigue ocupado sin un mock sondeable tras ${ensureTimeoutMs}ms`,
  );
}

/** Cierra el mock de ESTE proceso (los de otros procesos no nos pertenecen). */
export async function stopMockGateway(): Promise<void> {
  if (!running) return;
  const { server } = running;
  running = undefined;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
