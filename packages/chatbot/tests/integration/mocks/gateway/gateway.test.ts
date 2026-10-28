import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MOCK_GATEWAY_PORT,
  MOCK_IMAGE_PNG_BASE64,
  SLOW_STREAM_CHUNKS,
  SLOW_STREAM_TEXT,
  ensureMockGateway,
  isMockGatewayAlive,
  stopMockGateway,
} from "../../../mocks/gateway/server";

/**
 * The chatbot Mock Model Gateway (`:4001`) as the E2E consume it: the
 * consumer-owned catalog (`tests/mocks/gateway/catalog.ts`) and the `e2e`
 * execution profile (`tests/mocks/gateway/profiles.ts`), served over HTTP by
 * the official toolkit.
 *
 * The protocol itself (SSE framing, rendering parity between MSW and the
 * server, authentication, unknown routes, stream release) is covered by the
 * toolkit's own suite (`packages/model-gateway/js/tests`). What is asserted
 * here is what belongs to the chatbot: the ids the specs select, the texts and
 * pacing they observe, and the internal operations a full turn triggers.
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

interface SseChunk {
  choices?: Array<{
    delta?: {
      content?: string | Array<{ type: string; text?: string; image_url?: { url?: string } }>;
      reasoning_content?: string;
      tool_calls?: Array<{ function: { name: string; arguments: string } }>;
    };
    finish_reason?: string | null;
  }>;
}

/** Parses the SSE body into its `data:` payloads (`[DONE]` excluded). */
async function sseEvents(response: Response): Promise<SseChunk[]> {
  const raw = await response.text();
  return raw
    .split("\n\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice("data: ".length)) as SseChunk);
}

const streamText = (events: SseChunk[]): string =>
  events.map((event) => {
    const content = event.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  }).join("");

const chat = (model: string, messages: unknown[], extra: Record<string, unknown> = {}) =>
  post("/v1/chat/completions", { model, stream: true, messages, ...extra });

const systemMessage = (content: string) => ({ role: "system", content });

beforeAll(async () => {
  await ensureMockGateway();
});

afterAll(async () => {
  await stopMockGateway();
});

describe("Mock Model Gateway lifecycle", () => {
  it("ensureMockGateway is idempotent (reuses the live mock)", async () => {
    const handle = await ensureMockGateway();
    expect(handle.started).toBe(false);
    expect(await isMockGatewayAlive(MOCK_GATEWAY_PORT)).toBe(true);
  });
});

describe("catalog (consumer-owned, registered once)", () => {
  it("serves the capability ids in catalog order", async () => {
    const response = await get("/v1/models/catalog");
    expect(response.status).toBe(200);
    const { models } = (await response.json()) as {
      models: Array<Record<string, unknown>>;
    };

    expect(models.map((model) => model.id)).toEqual([
      "basicChat",
      "basicChatAlt",
      "canExecuteTools",
      "canSeeImages",
      "canProduceReasoning",
      "alwaysRefuses",
      "failsMidStream",
      "slowStream",
    ]);

    // Exact schema of the shared contract (§1): no internal fields.
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
  });

  it("keeps the invariants the E2E read from the entries", async () => {
    const response = await get("/v1/models/catalog");
    const { models } = (await response.json()) as {
      models: Array<Record<string, unknown>>;
    };
    const byId = new Map(models.map((model) => [model.id as string, model]));

    expect(byId.get("basicChat")?.isDefault).toBe(true);
    expect(models.filter((model) => model.isDefault)).toHaveLength(1);
    // settings.spec switches between the two and expects another temperature.
    expect(byId.get("basicChat")?.temperature).not.toEqual(
      byId.get("alwaysRefuses")?.temperature,
    );
    expect(byId.get("alwaysRefuses")?.temperature).toBe(1);
    // attachments.spec offers the image input only for this model.
    expect(byId.get("canSeeImages")?.supportedFiles).toEqual(["img"]);
    expect(byId.get("canProduceReasoning")).toMatchObject({
      reasoning: true,
      thinkingLevels: ["low", "medium", "high"],
      defaultThinkingLevel: "medium",
    });
  });

  it("hides the *-default contracts unless ?include_internal=true", async () => {
    const publicOnly = (await (
      await get("/v1/models/catalog?include_internal=false")
    ).json()) as { models: Array<{ id: string }> };
    expect(publicOnly.models.map((model) => model.id)).not.toContain("image-default");

    const withInternal = (await (
      await get("/v1/models/catalog?include_internal=true")
    ).json()) as { models: Array<{ id: string }> };
    const ids = withInternal.models.map((model) => model.id);
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
      expect(ids).toContain(contract);
    }
  });
});

describe("e2e profile — user-invocable capability ids", () => {
  it("basicChat and basicChatAlt answer with their id and the request temperature", async () => {
    const basic = await chat("basicChat", [{ role: "user", content: "hi" }], {
      temperature: 0.6,
    });
    expect(streamText(await sseEvents(basic))).toBe(
      "Hello, I'm basicChat, Temperature: 0.6, ",
    );

    const alt = await chat("basicChatAlt", [{ role: "user", content: "hi" }], {
      temperature: 0.7,
    });
    expect(streamText(await sseEvents(alt))).toBe(
      "Hello, I'm basicChatAlt, Temperature: 0.7, ",
    );
  });

  it("canExecuteTools derives both turns from the request history", async () => {
    const firstEvents = await sseEvents(
      await chat("canExecuteTools", [{ role: "user", content: "what's the weather?" }]),
    );
    const toolCall = firstEvents.find(
      (event) => event.choices?.[0]?.delta?.tool_calls != null,
    );
    expect(toolCall?.choices?.[0]?.delta?.tool_calls?.[0]?.function).toEqual({
      name: "webSearch",
      arguments: TOOL_ARGS,
    });
    expect(firstEvents.at(-1)?.choices?.[0]?.finish_reason).toBe("tool_calls");

    // The second turn carries the tool result: it answers with the final text.
    const secondEvents = await sseEvents(
      await chat("canExecuteTools", [
        { role: "user", content: "what's the weather?" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "webSearch", arguments: TOOL_ARGS },
            },
          ],
        },
        { role: "tool", tool_call_id: "call-1", content: "68°F sunny" },
      ]),
    );
    expect(streamText(secondEvents)).toBe(
      "Based on the search results, it is 68°F and sunny in San Francisco.",
    );
  });

  it("canSeeImages describes the image and alwaysRefuses refuses", async () => {
    const vision = await sseEvents(
      await chat("canSeeImages", [{ role: "user", content: [{ type: "image", image: "x" }] }]),
    );
    expect(streamText(vision)).toBe("Image description (mock)");

    const refusal = await sseEvents(
      await chat("alwaysRefuses", [{ role: "user", content: "do a bad thing" }]),
    );
    expect(streamText(refusal)).toBe("I cannot help with that request.");
  });

  it("canProduceReasoning emits reasoning_content before the answer", async () => {
    const events = await sseEvents(
      await chat("canProduceReasoning", [{ role: "user", content: "meaning of life" }]),
    );
    const reasoning = events
      .map((event) => event.choices?.[0]?.delta?.reasoning_content ?? "")
      .join("");
    expect(reasoning).toBe("Let me think about this carefully...");
    expect(streamText(events)).toBe("The answer is 42.");
  });

  it("failsMidStream emits a partial text and cuts the stream without [DONE]", async () => {
    const response = await chat("failsMidStream", [{ role: "user", content: "hi" }]);
    const raw = await response.text();
    expect(raw).not.toContain("[DONE]");

    const events = raw
      .split("\n\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice("data: ".length)) as SseChunk & {
        error?: { message: string; type: string };
      });
    expect(streamText(events)).toBe("Partial answer before the failure...");
    expect(events.at(-1)?.error).toMatchObject({
      message: "Mock mid-stream error",
      type: "server_error",
    });
  });

  it("slowStream keeps the resume suite's chunks and full text", async () => {
    const events = await sseEvents(
      await chat("slowStream", [{ role: "user", content: "tell me a long story" }]),
    );
    expect(SLOW_STREAM_CHUNKS).toHaveLength(8);
    expect(streamText(events)).toBe(SLOW_STREAM_TEXT);
    expect(SLOW_STREAM_TEXT).toBe("SLOW chunk 0.SLOW chunk 1.SLOW chunk 2.SLOW chunk 3.SLOW chunk 4.SLOW chunk 5.SLOW chunk 6.SLOW chunk 7.");
  });
});

describe("e2e profile — internal operations and Default Model Contracts", () => {
  it("fast-default answers the chat title as plain text", async () => {
    const events = await sseEvents(
      await chat("fast-default", [
        systemMessage("You are a chat title generator. Create a concise title"),
        { role: "user", content: '["Hello there"]' },
      ]),
    );
    expect(streamText(events)).toBe("Mock response from fast-default (contract).");
  });

  it("fast-default answers the memory operations with schema-valid JSON", async () => {
    const decomposition = await sseEvents(
      await chat("fast-default", [
        systemMessage("You are an expert system designed to optimize memory retrieval"),
        { role: "user", content: 'User Message: "where should I travel?"' },
      ]),
    );
    expect(JSON.parse(streamText(decomposition))).toEqual({
      queries: ["e2e memory query"],
    });

    // Empty facts: extraction is fire-and-forget after every turn and must not
    // leak persisted facts into later journeys.
    const extraction = await sseEvents(
      await chat("fast-default", [
        systemMessage("You are an assistant that extracts persistent facts about a user"),
        { role: "user", content: "user: hello\nassistant: hi" },
      ]),
    );
    expect(JSON.parse(streamText(extraction))).toEqual({ facts: [] });

    const urlIntent = await sseEvents(
      await chat("fast-default", [
        systemMessage("You are acting as a highly accurate intent classification engine"),
        { role: "user", content: "https://example.com" },
      ]),
    );
    expect(JSON.parse(streamText(urlIntent))).toEqual({ intent: "OTHER" });
  });

  it("fast-default rejects an operation the profile does not know", async () => {
    const response = await chat("fast-default", [
      systemMessage("an operation nobody declared"),
      { role: "user", content: "hi" },
    ]);
    expect(response.status).toBe(422);
    expect((await response.json()) as unknown).toMatchObject({
      error: { type: "unsupported_operation" },
    });
  });

  it("reasoning-default and vision-default answer the compaction summary contract", async () => {
    for (const contract of ["reasoning-default", "vision-default"]) {
      const events = await sseEvents(
        await chat(contract, [
          systemMessage("You summarize conversations"),
          { role: "user", content: "summarize" },
        ]),
      );
      expect(streamText(events)).toBe(`Mock response from ${contract} (contract).`);
    }
  });

  it("image-default answers a multipart message with an image_url part", async () => {
    const response = await post("/v1/chat/completions", {
      model: "image-default",
      modalities: ["image", "text"],
      messages: [{ role: "user", content: "brighten it" }],
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      choices: Array<{
        message: {
          content: Array<{
            type: string;
            text?: string;
            image_url?: { url?: string };
          }>;
        };
      }>;
    };
    const parts = body.choices[0]?.message.content ?? [];
    expect(parts.find((part) => part.type === "text")).toMatchObject({
      text: "Enhanced image (mock).",
    });
    expect(parts.find((part) => part.type === "image_url")?.image_url?.url).toBe(
      `data:image/png;base64,${MOCK_IMAGE_PNG_BASE64}`,
    );
  });

  it("rejects a model id the profile does not declare (no catch-all success)", async () => {
    const response = await chat("free-default", [{ role: "user", content: "hi" }]);
    expect(response.status).toBe(422);
    expect((await response.json()) as unknown).toMatchObject({
      error: { type: "unsupported_model" },
    });
  });
});

describe("e2e profile — non-chat operations", () => {
  it("embedding-default returns deterministic 768-dimension vectors", async () => {
    const response = await post("/v1/embeddings", {
      model: "embedding-default",
      input: ["hello world", "hello world", "different text"],
      dimensions: 768,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ index: number; embedding: number[] }>;
    };
    expect(body.data.map((item) => item.index)).toEqual([0, 1, 2]);
    for (const item of body.data) expect(item.embedding).toHaveLength(768);
    expect(body.data[0]!.embedding).toEqual(body.data[1]!.embedding);
    expect(body.data[0]!.embedding).not.toEqual(body.data[2]!.embedding);
  });

  it("rerank-default keeps the empty ranking of the test semantics", async () => {
    const response = await post("/v1/rerank", {
      model: "rerank-default",
      query: "query",
      documents: ["doc1", "doc2"],
      top_n: 2,
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toMatchObject({ results: [] });
  });

  it.each(["/v1/decisions", "/v1/systemone"])(
    "decision-default answers the Chat Mode Routing question with ctx7 (%s)",
    async (path) => {
      const response = await post(path, {
        model: "decision-default",
        state: { latest_message: "hola" },
        questions: {
          mode: {
            type: "choice",
            criteria: { ctx7: "docs", web: "current info", neither: "chat" },
          },
        },
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        answers: Record<string, { choice: string; confidence: number }>;
        model: string;
      };
      // `ctx7` is the criterion that resolves to the `context7` Chat Mode.
      expect(body.answers.mode).toMatchObject({ choice: "ctx7", confidence: 1 });
      expect(body.model).toBe("decision-default");
    },
  );

  it("decision-default rejects a question the profile does not declare", async () => {
    const response = await post("/v1/decisions", {
      model: "decision-default",
      questions: { unknown_question: { type: "choice", criteria: { a: "a" } } },
    });
    expect(response.status).toBe(422);
    expect((await response.json()) as unknown).toMatchObject({
      error: { type: "unsupported_question" },
    });
  });

  it("tts-default returns deterministic WAV audio", async () => {
    const response = await post("/v1/audio/speech", {
      model: "tts-default",
      input: "hello",
      voice: "alloy",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    const audio = Buffer.from(await response.arrayBuffer());
    expect(audio.subarray(0, 4).toString()).toBe("RIFF");
    expect(audio.subarray(8, 12).toString()).toBe("WAVE");
  });
});
