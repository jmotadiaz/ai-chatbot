import { afterEach, describe, expect, it, vi } from "vitest";
import { HTTPClient, OpenRouter, type Fetcher } from "@openrouter/sdk";
import { runWithTraceContext } from "tracing";
import fixture from "@/tests/fixtures/openrouter/decisions-response.json";
import {
  CHAT_MODE_ROUTING_QUESTION_KEY,
  createOpenRouterChatModeRouter,
  OPENROUTER_CHAT_MODE_ROUTING_MODEL,
  ROUTING_OPTIONS,
} from "@/lib/features/chat/mode-routing";
import type { ChatModeRouterInput } from "@/lib/features/chat/mode-routing/types";

/**
 * Captured shape of the Decisions request as it goes out on the wire (the SDK
 * serializes `sessionId` as `session_id` and keeps the rest as-is).
 */
interface CapturedDecisionsRequest {
  model?: string;
  questions?: Record<
    string,
    { type?: string; instructions?: string; criteria?: Record<string, unknown> }
  >;
  state?: Record<string, unknown>;
  session_id?: string;
  trace?: { trace_id?: string; trace_name?: string };
}

interface CapturedCall {
  url: string;
  method: string;
  authorization: string | null;
  body: CapturedDecisionsRequest;
}

/**
 * Contract test: no network. A real `OpenRouter` client is pointed at a canned
 * fetcher replaying the captured response body, so both the request the SDK
 * emits and its inbound (wire → SDK casing) parsing are exercised.
 */
const makeHarness = (response: unknown, status = 200) => {
  const calls: CapturedCall[] = [];

  const fetcher: Fetcher = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    calls.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get("authorization"),
      body: (await request.clone().json()) as CapturedDecisionsRequest,
    });

    return new Response(JSON.stringify(response), {
      status,
      headers: { "content-type": "application/json" },
    });
  };

  const client = new OpenRouter({
    apiKey: "sk-or-v1-test-key",
    httpClient: new HTTPClient({ fetcher }),
  });

  return { router: createOpenRouterChatModeRouter({ client }), calls };
};

const input: ChatModeRouterInput = {
  latestMessage: "¿Sigue funcionando el endpoint alpha de decisiones?",
  recentContext: "user: hola\nassistant: hola",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OpenRouter Decisions adapter (contract)", () => {
  it("posts the choice question and parses the captured response", async () => {
    const { router, calls } = makeHarness(fixture);

    const decision = await router.route(input);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.authorization).toBe("Bearer sk-or-v1-test-key");

    const question = calls[0]!.body.questions?.[CHAT_MODE_ROUTING_QUESTION_KEY];
    expect(calls[0]!.body.model).toBe(OPENROUTER_CHAT_MODE_ROUTING_MODEL);
    expect(question?.type).toBe("choice");
    expect(Object.keys(question?.criteria ?? {})).toEqual([...ROUTING_OPTIONS]);
    expect(question?.instructions?.length).toBeGreaterThan(0);
    expect(question?.criteria?.ctx7).toBeTruthy();
    expect(question?.criteria?.web).toBeTruthy();
    expect(question?.criteria?.neither).toBeTruthy();
    expect(calls[0]!.body.state).toEqual({
      latest_message: input.latestMessage,
      recent_context: input.recentContext,
    });
    // No trace scope in a plain call: nothing to group the session with.
    expect(calls[0]!.body.session_id).toBeUndefined();
    expect(calls[0]!.body.trace).toBeUndefined();

    // Fixture choice is `web`; the SDK remaps `usage.input_tokens` while
    // parsing, which is why the response is replayed raw.
    expect(decision).toEqual({
      mode: "web",
      reason: "routed",
      confidence: 0.55,
      probabilities: { ctx7: 0.29, web: 0.71, neither: 0 },
      modelId: "typesafe/jev-1.13-20260917",
      provider: "TypeSafe",
      latencyMs: expect.any(Number),
    });
  });

  it("forwards chatId as session_id and the trace run id when tracing", async () => {
    vi.stubEnv("TRACE_ENABLED", "1");
    const { router, calls } = makeHarness(fixture);

    await runWithTraceContext({ runId: "run-1", chatId: "chat-1" }, () =>
      router.route(input),
    );

    expect(calls[0]!.body.session_id).toBe("chat-1");
    expect(calls[0]!.body.trace).toEqual({
      trace_id: "run-1",
      trace_name: "chat-mode-routing",
    });
  });

  it("rejects on a 4xx so the fallback policy owns the degradation", async () => {
    const { router } = makeHarness(
      { error: { code: 400, message: "invalid questions" } },
      400,
    );

    await expect(router.route(input)).rejects.toThrow();
  });

  it("rejects an unknown choice instead of guessing a mode", async () => {
    const { router } = makeHarness({
      ...fixture,
      answers: { mode: { ...fixture.answers.mode, choice: "banana" } },
    });

    await expect(router.route(input)).rejects.toThrow(/Unknown chat mode option/);
  });
});
