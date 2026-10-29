import { describe, expect, it } from "vitest";
import {
  CHAT_COMPLETION_CREATED,
  CHAT_COMPLETION_ID,
  SSE_DONE_FRAME,
  catalogResponse,
  decisionsResponse,
  deterministicEmbedding,
  deterministicWav,
  embeddingsResponse,
  errorBody,
  imageReply,
  midStreamErrorReply,
  pacedTextReply,
  reasoningReply,
  renderChatResponse,
  rerankResponse,
  scriptedReply,
  speechResponse,
  textReply,
  toolCallReply,
  toolResultReply,
  unauthorizedResponse,
  type SseEvent,
} from "../../src/index";

function sseData(events: SseEvent[]): string[] {
  return events
    .map((event) => event.frame)
    .filter((frame) => frame.startsWith("data: "))
    .map((frame) => frame.slice("data: ".length).replace(/\n\n$/, ""));
}

function parseSse(events: SseEvent[]): {
  payloads: unknown[];
  done: boolean;
} {
  const data = sseData(events);
  return {
    payloads: data
      .filter((payload) => payload !== "[DONE]")
      .map((payload) => JSON.parse(payload) as unknown),
    done: data.includes("[DONE]"),
  };
}

interface Chunk {
  id: string;
  created: number;
  model?: string;
  choices: Array<{
    delta: {
      role?: string;
      content?: string | unknown[];
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string | null;
  }>;
}

const chunkOf = (payload: unknown): Chunk => payload as Chunk;

describe("chat rendering", () => {
  it("streams a text reply with deterministic ids and finish reason", () => {
    const rendered = renderChatResponse(textReply("hello"), {
      stream: true,
      model: "basicChat",
    });
    expect(rendered.kind).toBe("sse");
    if (rendered.kind !== "sse") throw new Error("expected sse");

    const { payloads, done } = parseSse(rendered.events);
    expect(done).toBe(true);
    const chunks = payloads.map(chunkOf);
    expect(chunks[0]!.id).toBe(CHAT_COMPLETION_ID);
    expect(chunks[0]!.created).toBe(CHAT_COMPLETION_CREATED);
    expect(chunks[0]!.model).toBe("basicChat");
    expect(chunks[0]!.choices[0]!.delta.content).toBe("hello");
    expect(chunks.at(-1)!.choices[0]!.finish_reason).toBe("stop");
    expect(rendered.events.at(-1)!.frame).toBe(SSE_DONE_FRAME);
  });

  it("renders the non-streaming body from the same reply", () => {
    const rendered = renderChatResponse(textReply("hello"), { model: "basicChat" });
    expect(rendered.kind).toBe("json");
    if (rendered.kind !== "json") throw new Error("expected json");

    const body = rendered.body as {
      object: string;
      model: string;
      choices: Array<{ message: { role: string; content: string }; finish_reason: string }>;
    };
    expect(body.object).toBe("chat.completion");
    expect(body.model).toBe("basicChat");
    expect(body.choices[0]!.message).toEqual({ role: "assistant", content: "hello" });
    expect(body.choices[0]!.finish_reason).toBe("stop");
  });

  it("uses an explicit json content when the reply provides one", () => {
    const reply = { ...toolCallReply({ calls: [] }), json: "final text" };
    const rendered = renderChatResponse(reply);
    expect(rendered.kind).toBe("json");
    if (rendered.kind !== "json") throw new Error("expected json");
    const body = rendered.body as { choices: Array<{ message: { content: string } }> };
    expect(body.choices[0]!.message.content).toBe("final text");
  });

  it("streams reasoning_content before the text", () => {
    const rendered = renderChatResponse(
      reasoningReply({ reasoning: "thinking", text: "answer" }),
      { stream: true },
    );
    if (rendered.kind !== "sse") throw new Error("expected sse");
    const chunks = parseSse(rendered.events).payloads.map(chunkOf);
    expect(chunks[1]!.choices[0]!.delta.reasoning_content).toBe("thinking");
    expect(chunks[2]!.choices[0]!.delta.content).toBe("answer");
  });

  it("renders tool calls with finish_reason tool_calls", () => {
    const rendered = renderChatResponse(
      toolCallReply({ calls: [{ id: "call-1", name: "webSearch", arguments: '{"q":"x"}' }] }),
      { stream: true },
    );
    if (rendered.kind !== "sse") throw new Error("expected sse");
    const chunks = parseSse(rendered.events).payloads.map(chunkOf);
    expect(chunks[1]!.choices[0]!.delta.tool_calls).toEqual([
      {
        index: 0,
        id: "call-1",
        type: "function",
        function: { name: "webSearch", arguments: '{"q":"x"}' },
      },
    ]);
    expect(chunks.at(-1)!.choices[0]!.finish_reason).toBe("tool_calls");
  });

  it("renders a tool-result turn as plain text", () => {
    const rendered = renderChatResponse(toolResultReply("done"), { stream: true });
    if (rendered.kind !== "sse") throw new Error("expected sse");
    const chunks = parseSse(rendered.events).payloads.map(chunkOf);
    expect(chunks[0]!.choices[0]!.delta.content).toBe("done");
  });

  it("cuts a mid-stream error without a [DONE] frame", () => {
    const rendered = renderChatResponse(
      midStreamErrorReply({
        text: "partial",
        error: { error: { message: "boom", type: "server_error" } },
      }),
      { stream: true },
    );
    if (rendered.kind !== "sse") throw new Error("expected sse");
    const { payloads, done } = parseSse(rendered.events);
    expect(done).toBe(false);
    expect(rendered.events).toHaveLength(2);
    expect((payloads[0] as Chunk).choices[0]!.delta.content).toBe("partial");
    expect(payloads[1]).toEqual({ error: { message: "boom", type: "server_error" } });
  });

  it("renders an image reply as multipart text + image_url in both transport shapes", () => {
    const reply = imageReply({ text: "enhanced", base64: "AAAA", mediaType: "image/png" });
    const streamed = renderChatResponse(reply, { stream: true });
    if (streamed.kind !== "sse") throw new Error("expected sse");
    const parts = chunkOf(parseSse(streamed.events).payloads[0]).choices[0]!.delta
      .content as Array<{ type: string; text?: string; image_url?: { url?: string } }>;
    expect(parts.find((part) => part.type === "text")).toMatchObject({ text: "enhanced" });
    expect(parts.find((part) => part.type === "image_url")?.image_url?.url).toBe(
      "data:image/png;base64,AAAA",
    );

    const asJson = renderChatResponse(reply);
    if (asJson.kind !== "json") throw new Error("expected json");
    const body = asJson.body as { choices: Array<{ message: { content: unknown[] } }> };
    expect(body.choices[0]!.message.content).toEqual(parts);
  });

  it("paces every step of a paced text reply", () => {
    const reply = pacedTextReply({ chunks: ["a", "b", "c"], delayMs: 25 });
    const rendered = renderChatResponse(reply, { stream: true });
    if (rendered.kind !== "sse") throw new Error("expected sse");
    // role + 3 chunks + finish + [DONE]
    expect(rendered.events).toHaveLength(6);
    expect(rendered.events.slice(0, 5).every((event) => event.delayMs === 25)).toBe(true);
    expect(rendered.events.at(-1)!.frame).toBe(SSE_DONE_FRAME);

    const asJson = renderChatResponse(reply);
    if (asJson.kind !== "json") throw new Error("expected json");
    const body = asJson.body as { choices: Array<{ message: { content: string } }> };
    expect(body.choices[0]!.message.content).toBe("abc");
  });

  it("accepts scripted steps as an escape hatch", () => {
    const rendered = renderChatResponse(
      scriptedReply([
        { delta: { role: "assistant" } },
        { delta: { content: "one" }, delayMs: 5 },
        { delta: {}, finishReason: "stop" },
      ]),
      { stream: true },
    );
    if (rendered.kind !== "sse") throw new Error("expected sse");
    const chunks = parseSse(rendered.events).payloads.map(chunkOf);
    expect(chunks.map((chunk) => chunk.choices[0]!.delta.content ?? "")).toEqual(["", "one", ""]);
  });
});

describe("catalog", () => {
  const catalog = { public: [{ id: "public" }], internal: [{ id: "internal" }] };

  it("passes the consumer order through and hides internal entries by default", () => {
    expect(catalogResponse(catalog)).toEqual({ models: [{ id: "public" }] });
  });

  it("includes internal entries only when asked", () => {
    expect(catalogResponse(catalog, { includeInternal: true })).toEqual({
      models: [{ id: "public" }, { id: "internal" }],
    });
  });
});

describe("operation fixtures", () => {
  it("builds deterministic embeddings of the configured width", () => {
    const response = embeddingsResponse(
      { model: "embedding-default", input: ["hello", "hello", "other"] },
      { dimensions: 16 },
    );
    const body = response.body as {
      data: Array<{ index: number; embedding: number[] }>;
      usage: { total_tokens: number };
    };
    expect(body.data).toHaveLength(3);
    expect(body.data[0]!.embedding).toHaveLength(16);
    expect(body.data[0]!.embedding).toEqual(body.data[1]!.embedding);
    expect(body.data[0]!.embedding).not.toEqual(body.data[2]!.embedding);
    expect(body.data[0]!.embedding).toEqual(deterministicEmbedding("hello", 16));
    expect(body.usage.total_tokens).toBeGreaterThan(0);
  });

  it("accepts explicit vectors as prepared fixtures, keeping the rest deterministic", () => {
    const response = embeddingsResponse(
      { model: "embedding-default", input: ["first", "second"] },
      { dimensions: 3, vectors: [[1, 0, 0]] },
    );
    const body = response.body as {
      data: Array<{ index: number; embedding: number[] }>;
    };
    expect(body.data[0]!.embedding).toEqual([1, 0, 0]);
    expect(body.data[1]!.embedding).toEqual(deterministicEmbedding("second", 3));
  });

  it("defaults the rerank ranking to empty and accepts explicit results", () => {
    expect(rerankResponse({ model: "rerank-default" }).body).toMatchObject({ results: [] });
    const explicit = rerankResponse(
      { model: "rerank-default" },
      { results: [{ index: 1, relevance_score: 0.9 }] },
    );
    expect(explicit.body).toMatchObject({ results: [{ index: 1, relevance_score: 0.9 }] });
  });

  it("answers decisions with the first criterion and uniform probabilities", () => {
    const response = decisionsResponse({
      model: "decision-default",
      questions: {
        routing: {
          type: "choice",
          criteria: { first: "a", second: "b", third: "c" },
        },
        ignored: { type: "text" },
      },
    });
    expect(response.body).toEqual({
      answers: {
        routing: {
          type: "choice",
          choice: "first",
          confidence: 1,
          probabilities: { first: 1 / 3, second: 1 / 3, third: 1 / 3 },
        },
      },
      model: "decision-default",
      provider: "mock-model-gateway",
      usage: { cost: 0 },
    });
  });

  it("answers decisions with the consumer's declared choice per question", () => {
    const response = decisionsResponse(
      {
        model: "decision-default",
        questions: {
          mode: { type: "choice", criteria: { ctx7: "docs", web: "current", neither: "chat" } },
        },
      },
      { choices: { mode: "web" } },
    );
    expect(response.body).toMatchObject({
      answers: {
        mode: {
          type: "choice",
          choice: "web",
          confidence: 1,
          probabilities: { ctx7: 1 / 3, web: 1 / 3, neither: 1 / 3 },
        },
      },
    });
  });

  it("rejects a declared choice that is not one of the question's criteria", () => {
    expect(() =>
      decisionsResponse(
        {
          model: "decision-default",
          questions: { mode: { type: "choice", criteria: { ctx7: "docs" } } },
        },
        { choices: { mode: "nope" } },
      ),
    ).toThrow(/not one of the criteria/);
  });

  it("overlays the consumer's extra answer fields on the rendered answer", () => {
    const response = decisionsResponse(
      {
        model: "decision-default",
        questions: {
          mode: { type: "choice", criteria: { ctx7: "docs", web: "current" } },
        },
      },
      {
        choices: { mode: "ctx7" },
        answerFields: {
          mode: { confidence: 0.42, probabilities: { ctx7: 0.9, web: 0.1 } },
        },
      },
    );
    expect(response.body).toMatchObject({
      answers: {
        mode: {
          type: "choice",
          choice: "ctx7",
          confidence: 0.42,
          probabilities: { ctx7: 0.9, web: 0.1 },
        },
      },
    });
  });

  it("rejects answer fields for a question the request does not ask", () => {
    expect(() =>
      decisionsResponse(
        {
          model: "decision-default",
          questions: { mode: { type: "choice", criteria: { ctx7: "docs" } } },
        },
        { answerFields: { other: { confidence: 0.42 } } },
      ),
    ).toThrow(/does not ask as a choice question/);
  });

  it("serves deterministic WAV audio with the contract media type", () => {
    const audio = deterministicWav("hello");
    expect(audio).toHaveLength(44 + 800 * 2);
    expect(String.fromCharCode(...audio.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...audio.subarray(8, 12))).toBe("WAVE");
    expect(deterministicWav("hello")).toEqual(audio);
    // An empty input must not produce NaN samples.
    expect(deterministicWav("").some((byte) => Number.isNaN(byte))).toBe(false);

    const response = speechResponse({ model: "tts-default", input: "hello" });
    expect(response.headers).toEqual({ "Content-Type": "audio/mpeg" });
    expect(response.body).toEqual(audio);
  });

  it("renders the explicit unauthorized reply", () => {
    const reply = unauthorizedResponse();
    expect(reply.status).toBe(401);
    expect(reply.body).toEqual({
      error: {
        message: "Missing Authorization header",
        type: "auth_error",
        code: "unauthorized",
      },
    });
    expect(errorBody("boom", "unsupported_model")).toEqual({
      error: { message: "boom", type: "unsupported_model" },
    });
  });
});
