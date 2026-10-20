import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MOCK_IMAGE_PNG_BASE64,
  ensureMockGateway,
  isMockGatewayAlive,
  stopMockGateway,
  MOCK_GATEWAY_PORT,
} from "../../../mocks/gateway/server";

/**
 * Mock Model Gateway (`:4001`) — contrato compartido §4. In-process (node:http
 * es infraestructura, no lógica pura) y sobre el puerto canónico `4001` vía
 * `ensureMockGateway()`, para no chocar con un mock ya levantado por el e2e.
 */

const BASE = `http://127.0.0.1:${MOCK_GATEWAY_PORT}`;
const AUTH = { Authorization: "Bearer test-gateway-key" } as const;
const JSON_AUTH = { ...AUTH, "Content-Type": "application/json" } as const;
const TOOL_ARGS = '{"query":"current weather in San Francisco"}';

const get = (path: string, headers: Record<string, string> = AUTH) =>
  fetch(`${BASE}${path}`, { headers });

const post = (path: string, body: unknown, extraHeaders: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...JSON_AUTH, ...extraHeaders },
    body: JSON.stringify(body),
  });

/** Parsea el cuerpo SSE en eventos `data:` (con `[DONE]` eliminado). */
async function sseEvents(response: Response): Promise<unknown[]> {
  const raw = await response.text();
  return raw
    .split("\n\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice("data: ".length)) as unknown);
}

/** Concatena los deltas de texto de un stream de chat. */
const streamText = (events: unknown[]): string =>
  events
    .map((event) => {
      const chunk = event as { choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }> };
      return chunk.choices?.[0]?.delta?.content ?? "";
    })
    .join("");

beforeAll(async () => {
  await ensureMockGateway();
});

afterAll(async () => {
  await stopMockGateway();
});

describe("Mock Model Gateway — infraestructura", () => {
  it("ensureMockGateway es idempotente (reutiliza el mock vivo)", async () => {
    const first = await ensureMockGateway();
    expect(first.started).toBe(false);
    expect(await isMockGatewayAlive(MOCK_GATEWAY_PORT)).toBe(true);
  });

  describe("autenticación", () => {
    it("401 en cualquier ruta sin Authorization header", async () => {
      const noAuth = { "Content-Type": "application/json" };

      const catalog = await fetch(`${BASE}/v1/models/catalog`);
      expect(catalog.status).toBe(401);

      const chat = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: noAuth,
        body: JSON.stringify({ model: "basicChat", messages: [] }),
      });
      expect(chat.status).toBe(401);

      for (const path of [
        "/v1/embeddings",
        "/v1/rerank",
        "/v1/decisions",
        "/v1/systemone",
        "/v1/audio/speech",
      ]) {
        const response = await fetch(`${BASE}${path}`, {
          method: "POST",
          headers: noAuth,
          body: JSON.stringify({}),
        });
        expect(response.status, path).toBe(401);
      }
    });

    it("acepta cualquier bearer cuando hay header", async () => {
      const response = await get("/v1/models/catalog", {
        Authorization: "Bearer cualquiera",
      });
      expect(response.status).toBe(200);
    });
  });

  describe("GET /v1/models/catalog", () => {
    it("sirve el catálogo de test definido por capacidades", async () => {
      const response = await get("/v1/models/catalog");
      expect(response.status).toBe(200);
      const { models } = (await response.json()) as { models: Array<Record<string, unknown>> };

      expect(models.map((m) => m.id)).toEqual([
        "basicChat",
        "basicChatAlt",
        "canExecuteTools",
        "canSeeImages",
        "canProduceReasoning",
        "alwaysRefuses",
        "failsMidStream",
      ]);

      // Schema exacto del contrato compartido (§1): sin campos internos.
      expect(Object.keys(models[0]!).sort()).toEqual([
        "company",
        "contextWindow",
        "cost",
        "defaultThinkingLevel",
        "id",
        "isDefault",
        "maxTokens",
        "reasoning",
        "supportedFiles",
        "supportedOutput",
        "temperature",
        "thinkingLevels",
        "topK",
        "topP",
        "zeroDataRetention",
      ]);

      // Invariantes que consumen los e2e:
      const byId = new Map(models.map((m) => [m.id, m]));
      expect(byId.get("basicChat")?.isDefault).toBe(true);
      expect(models.filter((m) => m.isDefault)).toHaveLength(1);
      expect(byId.get("basicChat")?.temperature).not.toEqual(
        byId.get("alwaysRefuses")?.temperature,
      );
      expect(byId.get("alwaysRefuses")?.temperature).toBe(1);
      expect(byId.get("canSeeImages")?.supportedFiles).toEqual(["img"]);
      expect(byId.get("canProduceReasoning")).toMatchObject({
        reasoning: true,
        thinkingLevels: ["low", "medium", "high"],
        defaultThinkingLevel: "medium",
      });
    });

    it("?include_internal=false se trata como público (bug de la revisión)", async () => {
      const response = await get("/v1/models/catalog?include_internal=false");
      const { models } = (await response.json()) as { models: Array<{ id: string }> };
      expect(models.map((m) => m.id)).not.toContain("image-default");
      expect(models.map((m) => m.id)).toContain("basicChat");
    });

    it("?include_internal=true expone los contratos *-default", async () => {
      const response = await get("/v1/models/catalog?include_internal=true");
      const { models } = (await response.json()) as { models: Array<{ id: string }> };
      for (const contract of [
        "fast-default",
        "flash-default",
        "vision-default",
        "reasoning-default",
        "free-default",
        "image-default",
        "embedding-default",
        "rerank-default",
        "decision-default",
        "tts-default",
      ]) {
        expect(models.map((m) => m.id)).toContain(contract);
      }
    });
  });

  describe("POST /v1/chat/completions", () => {
    it("basicChat (stream): texto con modelo y temperatura del request", async () => {
      const response = await post("/v1/chat/completions", {
        model: "basicChat",
        stream: true,
        temperature: 0.6,
        messages: [{ role: "user", content: "hi" }],
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const events = await sseEvents(response);
      expect(streamText(events)).toBe("Hello, I'm basicChat, Temperature: 0.6, ");
      const last = events.at(-1) as { choices: Array<{ finish_reason: string }> };
      expect(last.choices[0]?.finish_reason).toBe("stop");
    });

    it("basicChatAlt (stream): mismo patrón con su id", async () => {
      const response = await post("/v1/chat/completions", {
        model: "basicChatAlt",
        stream: true,
        temperature: 0.7,
        messages: [{ role: "user", content: "hi" }],
      });
      const events = await sseEvents(response);
      expect(streamText(events)).toBe("Hello, I'm basicChatAlt, Temperature: 0.7, ");
    });

    it("basicChat (JSON): completion no-streaming", async () => {
      const response = await post("/v1/chat/completions", {
        model: "basicChat",
        temperature: 0.6,
        messages: [{ role: "user", content: "hi" }],
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      expect(body.choices[0]?.message.content).toBe(
        "Hello, I'm basicChat, Temperature: 0.6, ",
      );
    });

    it("image-default (JSON): mensaje multipart con parte image_url", async () => {
      const response = await post("/v1/chat/completions", {
        model: "image-default",
        modalities: ["image", "text"],
        messages: [{ role: "user", content: "brighten it" }],
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        choices: Array<{ message: { content: Array<{ type: string; image_url?: { url?: string } }> } }>;
      };
      const parts = body.choices[0]?.message.content ?? [];
      expect(parts.find((part) => part.type === "text")).toMatchObject({ text: "Enhanced image (mock)." });
      const image = parts.find((part) => part.type === "image_url");
      expect(image?.image_url?.url).toBe(
        `data:image/png;base64,${MOCK_IMAGE_PNG_BASE64}`,
      );
    });

    it("image-default (SSE): delta multipart con parte image_url", async () => {
      const response = await post("/v1/chat/completions", {
        model: "image-default",
        stream: true,
        messages: [{ role: "user", content: "brighten it" }],
      });
      const events = await sseEvents(response);
      const parts = events
        .map((event) => {
          const delta = (event as { choices?: Array<{ delta?: { content?: string | Array<{ type: string; image_url?: { url?: string } }> } }> })
            .choices?.[0]?.delta;
          return Array.isArray(delta?.content) ? delta!.content : [];
        })
        .flat();
      expect(parts.find((part) => part.type === "text")).toMatchObject({ text: "Enhanced image (mock)." });
      expect(parts.find((part) => part.type === "image_url")?.image_url?.url).toBe(
        `data:image/png;base64,${MOCK_IMAGE_PNG_BASE64}`,
      );
    });

    it("canExecuteTools: turno 1 → tool_calls webSearch; turno 2 → texto final", async () => {
      const first = await post("/v1/chat/completions", {
        model: "canExecuteTools",
        stream: true,
        messages: [{ role: "user", content: "what's the weather?" }],
      });
      const firstEvents = await sseEvents(first);
      const toolCallChunk = firstEvents.find((event) => {
        const delta = (event as { choices?: Array<{ delta?: { tool_calls?: unknown[] } }> })
          .choices?.[0]?.delta;
        return delta?.tool_calls != null;
      }) as { choices: Array<{ delta: { tool_calls: Array<{ function: { name: string; arguments: string } }> } }> } | undefined;
      expect(toolCallChunk).toBeDefined();
      expect(toolCallChunk!.choices[0]!.delta.tool_calls[0]!.function).toEqual({
        name: "webSearch",
        arguments: '{"query":"current weather in San Francisco"}',
      });
      const firstFinish = firstEvents.at(-1) as { choices: Array<{ finish_reason: string }> };
      expect(firstFinish.choices[0]?.finish_reason).toBe("tool_calls");

      const second = await post("/v1/chat/completions", {
        model: "canExecuteTools",
        stream: true,
        messages: [
          { role: "user", content: "what's the weather?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [{ id: "call-1", type: "function", function: { name: "webSearch", arguments: TOOL_ARGS } }],
          },
          { role: "tool", tool_call_id: "call-1", content: "68°F sunny" },
        ],
      });
      const secondEvents = await sseEvents(second);
      expect(streamText(secondEvents)).toBe(
        "Based on the search results, it is 68°F and sunny in San Francisco.",
      );
    });

    it("canSeeImages: texto de descripción", async () => {
      const response = await post("/v1/chat/completions", {
        model: "canSeeImages",
        stream: true,
        messages: [{ role: "user", content: [{ type: "image", image: "x" }] }],
      });
      const events = await sseEvents(response);
      expect(streamText(events)).toBe("Image description (mock)");
    });

    it("canProduceReasoning: reasoning_content en el delta + texto final", async () => {
      const response = await post("/v1/chat/completions", {
        model: "canProduceReasoning",
        stream: true,
        messages: [{ role: "user", content: "meaning of life" }],
      });
      const events = await sseEvents(response);
      const reasoning = events
        .map((event) => {
          const delta = (event as { choices?: Array<{ delta?: { reasoning_content?: string } }> })
            .choices?.[0]?.delta;
          return delta?.reasoning_content ?? "";
        })
        .join("");
      expect(reasoning).toBe("Let me think about this carefully...");
      expect(streamText(events)).toBe("The answer is 42.");
    });

    it("alwaysRefuses: negativa determinista", async () => {
      const response = await post("/v1/chat/completions", {
        model: "alwaysRefuses",
        stream: true,
        messages: [{ role: "user", content: "do a bad thing" }],
      });
      const events = await sseEvents(response);
      expect(streamText(events)).toBe("I cannot help with that request.");
    });

    it("failsMidStream: un trozo de texto y error sin [DONE]", async () => {
      const response = await post("/v1/chat/completions", {
        model: "failsMidStream",
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      });
      const raw = await response.text();
      expect(raw).not.toContain("[DONE]");

      const events = raw
        .split("\n\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice("data: ".length)) as unknown);
      // Primer evento: texto parcial. Último evento: error del provider.
      expect(streamText(events)).toBe("Partial answer before the failure...");
      const errorEvent = events.at(-1) as { error: { message: string; type: string } };
      expect(errorEvent.error).toMatchObject({
        message: "Mock mid-stream error",
        type: "server_error",
      });
    });

    it.each([
      "fast-default",
      "flash-default",
      "vision-default",
      "reasoning-default",
      "free-default",
    ])("contrato %s: texto determinista con su nombre", async (model) => {
      const response = await post("/v1/chat/completions", {
        model,
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      });
      const events = await sseEvents(response);
      expect(streamText(events)).toContain(model);
    });
  });

  describe("POST /v1/embeddings", () => {
    it("vector determinista de 768 dimensiones por input", async () => {
      const response = await post("/v1/embeddings", {
        model: "embedding-default",
        input: ["hello world", "hello world", "different text"],
        dimensions: 768,
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: Array<{ index: number; embedding: number[] }>;
        usage: { prompt_tokens: number; total_tokens: number };
      };
      expect(body.data).toHaveLength(3);
      for (const [index, item] of body.data.entries()) {
        expect(item.index).toBe(index);
        expect(item.embedding).toHaveLength(768);
        expect(item.embedding.every((v) => Number.isFinite(v))).toBe(true);
      }
      expect(body.data[0]!.embedding).toEqual(body.data[1]!.embedding);
      expect(body.data[0]!.embedding).not.toEqual(body.data[2]!.embedding);
      expect(body.usage.total_tokens).toBeGreaterThan(0);
    });

    it("mismo input entre llamadas → mismo vector", async () => {
      const body = { model: "embedding-default", input: ["stable text"] };
      const [a, b] = await Promise.all([post("/v1/embeddings", body), post("/v1/embeddings", body)]);
      const aData = (await a.json()) as { data: Array<{ embedding: number[] }> };
      const bData = (await b.json()) as { data: Array<{ embedding: number[] }> };
      expect(aData.data[0]!.embedding).toEqual(bData.data[0]!.embedding);
    });
  });

  describe("POST /v1/rerank", () => {
    it("ranking vacío: replica la semántica de test actual del chatbot", async () => {
      const response = await post("/v1/rerank", {
        model: "rerank-default",
        query: "query",
        documents: ["doc1", "doc2"],
        top_n: 2,
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { results: unknown[] };
      expect(body.results).toEqual([]);
    });
  });

  describe.each([
    ["POST /v1/decisions", "/v1/decisions"],
    ["POST /v1/systemone (alias)", "/v1/systemone"],
  ])("%s", (_label, path) => {
    it("answer choice determinista por pregunta", async () => {
      const response = await post(path, {
        model: "decision-default",
        state: { latest_message: "hola" },
        questions: {
          routing: {
            type: "choice",
            instructions: "pick one",
            criteria: { ctx7: "docs", web: "current info", neither: "chat" },
          },
        },
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        answers: Record<
          string,
          { type: string; choice: string; confidence: number; probabilities: Record<string, number> }
        >;
        model: string;
        provider: string;
        usage: { cost: number };
      };
      expect(body.answers.routing).toEqual({
        type: "choice",
        choice: "ctx7", // primer criterio declarado
        confidence: 1,
        probabilities: { ctx7: 1 / 3, web: 1 / 3, neither: 1 / 3 },
      });
      expect(body.model).toBe("decision-default");
      expect(body.provider).toBe("mock-model-gateway");
      expect(body.usage.cost).toBe(0);
    });
  });

  describe("POST /v1/audio/speech", () => {
    it("audio determinista con Content-Type audio/mpeg", async () => {
      const body = { model: "tts-default", input: "hello", voice: "alloy" };
      const [a, b] = await Promise.all([post("/v1/audio/speech", body), post("/v1/audio/speech", body)]);
      expect(a.headers.get("content-type")).toBe("audio/mpeg");
      const aBuffer = Buffer.from(await a.arrayBuffer());
      const bBuffer = Buffer.from(await b.arrayBuffer());
      expect(aBuffer.length).toBeGreaterThan(44); // header WAV + muestras
      expect(aBuffer.equals(bBuffer)).toBe(true);
      // Header RIFF/WAVE válido.
      expect(aBuffer.subarray(0, 4).toString()).toBe("RIFF");
      expect(aBuffer.subarray(8, 12).toString()).toBe("WAVE");
    });
  });

  it("404 en rutas desconocidas", async () => {
    const response = await get("/v1/unknown");
    expect(response.status).toBe(404);
  });
});
