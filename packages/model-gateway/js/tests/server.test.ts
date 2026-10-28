import { setupServer } from "msw/node";
import { describe, expect, it } from "vitest";
import {
  createGatewayScenario,
  decisionsResponse,
  embeddingsResponse,
  imageReply,
  midStreamErrorReply,
  pacedTextReply,
  rerankResponse,
  scriptedReply,
  speechResponse,
  textReply,
  type GatewayScenario,
} from "../src/index";
import { startGatewayServer } from "../src/server";

const AUTH = { Authorization: "Bearer test-key" } as const;
const JSON_AUTH = { ...AUTH, "Content-Type": "application/json" } as const;

function parityScenario(): GatewayScenario {
  return createGatewayScenario({
    catalog: { public: [{ id: "basicChat" }], internal: [{ id: "fast-default" }] },
    chat: (request) => {
      switch (request.model) {
        case "text":
          return textReply("Hello from the toolkit");
        case "image":
          return imageReply({ text: "Enhanced image (mock).", base64: "AAAA", mediaType: "image/png" });
        case "failsMidStream":
          return midStreamErrorReply({
            text: "Partial answer",
            error: { error: { message: "Mock mid-stream error", type: "server_error" } },
          });
        case "paced":
          return pacedTextReply({ chunks: ["one", "two"], delayMs: 0 });
        default:
          return undefined;
      }
    },
    embeddings: (request) => embeddingsResponse(request, { dimensions: 4 }),
    rerank: (request) => rerankResponse(request),
    decisions: (request) => decisionsResponse(request),
    speech: (request) => speechResponse(request),
  });
}

interface Snapshot {
  status: number;
  contentType: string | null;
  body: string;
}

async function snapshot(response: Response): Promise<Snapshot> {
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body: bytes.toString("base64"),
  };
}

/**
 * Captures a response through the MSW handlers. MSW intercepts any origin, so the
 * interception is scoped to this helper: a real gateway server must not be
 * reachable through `fetch` while it is listening.
 */
async function viaMsw(
  scenario: GatewayScenario,
  path: string,
  init: RequestInit = {},
): Promise<Snapshot> {
  const server = setupServer(...scenario.handlers);
  server.listen({ onUnhandledRequest: "error" });
  try {
    return await snapshot(await fetch(`http://127.0.0.1:4001${path}`, init));
  } finally {
    server.close();
  }
}

const chatBody = (model: string, stream: boolean) =>
  JSON.stringify({ model, stream, messages: [{ role: "user", content: "hi" }] });

const requests: Array<{
  label: string;
  path: string;
  init: RequestInit;
}> = [
  { label: "health probe", path: "/__mock-gateway/health", init: {} },
  { label: "catalog", path: "/v1/models/catalog", init: { headers: AUTH } },
  {
    label: "catalog with internal entries",
    path: "/v1/models/catalog?include_internal=true",
    init: { headers: AUTH },
  },
  {
    label: "chat stream",
    path: "/v1/chat/completions",
    init: { method: "POST", headers: JSON_AUTH, body: chatBody("text", true) },
  },
  {
    label: "chat json",
    path: "/v1/chat/completions",
    init: { method: "POST", headers: JSON_AUTH, body: chatBody("text", false) },
  },
  {
    label: "image reply stream",
    path: "/v1/chat/completions",
    init: { method: "POST", headers: JSON_AUTH, body: chatBody("image", true) },
  },
  {
    label: "mid-stream error",
    path: "/v1/chat/completions",
    init: { method: "POST", headers: JSON_AUTH, body: chatBody("failsMidStream", true) },
  },
  {
    label: "paced stream",
    path: "/v1/chat/completions",
    init: { method: "POST", headers: JSON_AUTH, body: chatBody("paced", true) },
  },
  {
    label: "unsupported model",
    path: "/v1/chat/completions",
    init: { method: "POST", headers: JSON_AUTH, body: chatBody("unknown", true) },
  },
  {
    label: "embeddings",
    path: "/v1/embeddings",
    init: {
      method: "POST",
      headers: JSON_AUTH,
      body: JSON.stringify({ model: "embedding-default", input: ["a", "b"] }),
    },
  },
  {
    label: "rerank",
    path: "/v1/rerank",
    init: {
      method: "POST",
      headers: JSON_AUTH,
      body: JSON.stringify({ model: "rerank-default", query: "q", documents: ["d"] }),
    },
  },
  {
    label: "decisions",
    path: "/v1/decisions",
    init: {
      method: "POST",
      headers: JSON_AUTH,
      body: JSON.stringify({
        model: "decision-default",
        questions: { routing: { type: "choice", criteria: { a: "A", b: "B" } } },
      }),
    },
  },
  {
    label: "audio",
    path: "/v1/audio/speech",
    init: {
      method: "POST",
      headers: JSON_AUTH,
      body: JSON.stringify({ model: "tts-default", input: "hello" }),
    },
  },
  { label: "unknown route", path: "/v1/unknown", init: { headers: AUTH } },
  {
    label: "missing authorization",
    path: "/v1/chat/completions",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: chatBody("text", true) },
  },
];

describe("MSW / HTTP server parity", () => {
  it("serializes byte-identical responses on both transports", async () => {
    const scenario = parityScenario();
    const server = await startGatewayServer(scenario);
    try {
      for (const request of requests) {
        const overMsw = await viaMsw(scenario, request.path, request.init);
        const overHttp = await snapshot(await fetch(`${server.url}${request.path}`, request.init));
        expect(overHttp, request.label).toEqual(overMsw);
      }
    } finally {
      await server.close();
    }
  });
});

describe("HTTP server dispatch", () => {
  it("records the requests it served and answers the public health probe", async () => {
    const scenario = parityScenario();
    const server = await startGatewayServer(scenario);
    try {
      const health = await fetch(`${server.url}/__mock-gateway/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ mock: "model-gateway" });
      expect(scenario.requests).toHaveLength(0);

      await fetch(`${server.url}/v1/chat/completions`, {
        method: "POST",
        headers: JSON_AUTH,
        body: chatBody("text", true),
      });
      expect(scenario.requests).toHaveLength(1);
      expect(scenario.requests[0]).toMatchObject({
        method: "POST",
        path: "/v1/chat/completions",
        body: { model: "text", stream: true },
      });
    } finally {
      await server.close();
    }
  });
});

async function timeoutCount(): Promise<number> {
  return process.getActiveResourcesInfo().filter((resource) => resource === "Timeout").length;
}

/**
 * Waits (without adding Timeout resources of its own) until no timer beyond the
 * baseline is pending: the proof that `close()`/disconnect released the pacing.
 */
async function waitForTimeoutsAtMost(baseline: number): Promise<boolean> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if ((await timeoutCount()) <= baseline) return true;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return false;
}

const slowReply = () =>
  scriptedReply([
    { delta: { role: "assistant" } },
    { delta: { content: "first" } },
    { delta: { content: "never" }, delayMs: 30_000 },
    { delta: {}, finishReason: "stop" },
  ]);

const startSlowRequest = async (url: string) =>
  fetch(`${url}/v1/chat/completions`, {
    method: "POST",
    headers: JSON_AUTH,
    body: chatBody("slow", true),
  });

describe("HTTP server lifecycle", () => {
  it("binds an ephemeral port and closes idempotently", async () => {
    const server = await startGatewayServer(createGatewayScenario({}));
    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toBe(`http://127.0.0.1:${server.port}`);
    await server.close();
    await server.close();
  });

  it("close aborts an in-flight paced stream and releases its timers", async () => {
    const baseline = await timeoutCount();
    const server = await startGatewayServer(
      createGatewayScenario({ chat: () => slowReply() }),
    );

    const response = await startSlowRequest(server.url);
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("first");

    const started = Date.now();
    await server.close();
    expect(Date.now() - started).toBeLessThan(2_000);

    // The client sees the stream end (either cleanly or as an aborted socket).
    await reader.read().then(
      () => undefined,
      () => undefined,
    );
    expect(await waitForTimeoutsAtMost(baseline)).toBe(true);
  });

  it("releases the stream when the client disconnects mid-flight", async () => {
    const server = await startGatewayServer(
      createGatewayScenario({ chat: () => slowReply() }),
    );
    const baseline = await timeoutCount();
    try {
      const controller = new AbortController();
      const response = await fetch(`${server.url}/v1/chat/completions`, {
        method: "POST",
        headers: JSON_AUTH,
        body: chatBody("slow", true),
        signal: controller.signal,
      });
      const reader = response.body!.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain("first");

      controller.abort();
      await reader.read().then(
        () => undefined,
        () => undefined,
      );
      // Let the server observe the socket close and cancel its pending timer.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      expect(await waitForTimeoutsAtMost(baseline)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("still serves a complete response after a client disconnects mid-stream", async () => {
    const server = await startGatewayServer(
      createGatewayScenario({
        chat: (request) => (request.stream ? slowReply() : textReply("still alive")),
      }),
    );
    try {
      const controller = new AbortController();
      const response = await fetch(`${server.url}/v1/chat/completions`, {
        method: "POST",
        headers: JSON_AUTH,
        body: chatBody("slow", true),
        signal: controller.signal,
      });
      await response.body!.getReader().read();
      controller.abort();
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      const after = await fetch(`${server.url}/v1/chat/completions`, {
        method: "POST",
        headers: JSON_AUTH,
        body: chatBody("text", false),
      });
      expect(after.status).toBe(200);
      const body = (await after.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      expect(body.choices[0]!.message.content).toBe("still alive");
    } finally {
      await server.close();
    }
  });
});

/**
 * MSW does not buffer a `ReadableStream` body: the toolkit hands the rendered
 * frames to the intercepted client as a stream, so a scenario's pacing and a
 * mid-stream disconnect behave the same in-process (MSW) as they do against the
 * HTTP server. These tests pin that parity down.
 */
describe("MSW transport — paced SSE streams", () => {
  const pacedScenario = (delayMs: number, chunks: readonly string[]) =>
    createGatewayScenario({
      chat: () => pacedTextReply({ chunks, delayMs }),
    });

  const chatRequest = (): RequestInit => ({
    method: "POST",
    headers: JSON_AUTH,
    body: chatBody("paced", true),
  });

  it("delivers paced frames incrementally instead of buffering the body", async () => {
    const scenario = pacedScenario(30, ["one", "two", "three"]);
    const server = setupServer(...scenario.handlers);
    server.listen({ onUnhandledRequest: "error" });

    try {
      const startedAt = Date.now();
      const response = await fetch("http://127.0.0.1:4001/v1/chat/completions", chatRequest());
      const reader = response.body!.getReader();

      const first = await reader.read();
      const firstFrameAt = Date.now();
      const frames = [new TextDecoder().decode(first.value)];

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        frames.push(new TextDecoder().decode(value));
      }
      const total = Date.now() - startedAt;

      // The first frame (the assistant role step) arrives long before the
      // stream is over: the body was not buffered until completion.
      expect(firstFrameAt - startedAt).toBeLessThan(total);
      // Every frame arrives in order and completes the reply.
      expect(first.done).toBe(false);
      expect(frames.join("")).toContain('"role":"assistant"');
      expect(frames.join("")).toContain("data: [DONE]");
      // Five paced steps (role + three chunks + finish) cannot complete faster
      // than four of the waits.
      expect(total).toBeGreaterThanOrEqual(30 * 4);
    } finally {
      server.close();
    }
  });
});
