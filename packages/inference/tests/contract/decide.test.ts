import { afterEach, describe, expect, it, vi } from "vitest";
import { HTTPClient, OpenRouter, type Fetcher } from "@openrouter/sdk";
import { runWithTraceContext } from "tracing";
import fixture from "../fixtures/openrouter/decisions-response.json";
import { createDecideResolver } from "../../src/decide";
import type { DecideOptions, DecisionsClient, DecisionsClients } from "../../src/types";

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
 * emits and its inbound (wire → SDK casing) parsing are exercised. This is the
 * `decide()` contract test moved from the chat-mode-routing feature (ticket 05
 * of the Inference Kit): same fixture, question key renamed from the feature's
 * own `mode` to `decide()`'s generic, caller-invisible `decision` key.
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
  }) as unknown as DecisionsClient;

  const clients: DecisionsClients = { openrouterDecisions: () => client };
  return { decide: createDecideResolver(clients), calls };
};

const options: DecideOptions = {
  model: "Jev 1.13",
  question: {
    instructions: "Classify how the assistant should answer.",
    criteria: {
      ctx7: "Needs library documentation.",
      web: "Needs current or externally verifiable information.",
      neither: "General reasoning is enough.",
    },
  },
  state: {
    latest_message: "¿Sigue funcionando el endpoint alpha de decisiones?",
    recent_context: "user: hola\nassistant: hola",
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("decide() over the OpenRouter Decisions API (contract)", () => {
  it("posts the choice question and parses the captured response", async () => {
    const { decide, calls } = makeHarness(fixture);

    const decision = await decide(options);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.authorization).toBe("Bearer sk-or-v1-test-key");

    const question = calls[0]!.body.questions?.decision;
    expect(calls[0]!.body.model).toBe("typesafe/jev-1.13");
    expect(question?.type).toBe("choice");
    expect(question?.instructions).toBe(options.question.instructions);
    expect(question?.criteria).toEqual(options.question.criteria);
    expect(calls[0]!.body.state).toEqual(options.state);
    // No trace scope in a plain call: nothing to group the session with.
    expect(calls[0]!.body.session_id).toBeUndefined();
    expect(calls[0]!.body.trace).toBeUndefined();

    // Fixture choice is `web`; the SDK remaps `usage.input_tokens` while
    // parsing, which is why the response is replayed raw. `costUsd` comes from
    // `usage.cost`, the per-turn accounting required by the spec.
    expect(decision).toEqual({
      choice: "web",
      confidence: 0.55,
      probabilities: { ctx7: 0.29, web: 0.71, neither: 0 },
      modelId: "typesafe/jev-1.13-20260917",
      provider: "TypeSafe",
      latencyMs: expect.any(Number),
      costUsd: 0.000017976,
    });
  });

  it("resolves the model by Model Role too", async () => {
    const { decide, calls } = makeHarness(fixture);

    await decide({ ...options, model: "chatModeRouter" });

    expect(calls[0]!.body.model).toBe("typesafe/jev-1.13");
  });

  it("omits the cost when the response carries no usage cost", async () => {
    const { decide } = makeHarness({
      ...fixture,
      usage: { ...fixture.usage, cost: undefined },
    });

    const decision = await decide(options);

    expect(decision.costUsd).toBeUndefined();
    expect(decision.latencyMs).toEqual(expect.any(Number));
  });

  it("forwards chatId as session_id and the trace run id when tracing", async () => {
    vi.stubEnv("TRACE_ENABLED", "1");
    const { decide, calls } = makeHarness(fixture);

    await runWithTraceContext({ runId: "run-1", chatId: "chat-1" }, () =>
      decide(options),
    );

    expect(calls[0]!.body.session_id).toBe("chat-1");
    expect(calls[0]!.body.trace).toEqual({
      trace_id: "run-1",
      trace_name: "Jev 1.13",
    });
  });

  it("does not set a trace scope when an explicit empty scope is passed, even while tracing", async () => {
    vi.stubEnv("TRACE_ENABLED", "1");
    const { decide, calls } = makeHarness(fixture);

    await runWithTraceContext({ runId: "run-1", chatId: "chat-1" }, () =>
      decide({ ...options, scope: {} }),
    );

    expect(calls[0]!.body.session_id).toBeUndefined();
    expect(calls[0]!.body.trace).toBeUndefined();
  });

  it("rejects on a 4xx so the caller's fallback policy owns the degradation", async () => {
    const { decide } = makeHarness(
      { error: { code: 400, message: "invalid questions" } },
      400,
    );

    await expect(decide(options)).rejects.toThrow();
  });

  it("rejects a non-choice answer instead of guessing", async () => {
    const { decide } = makeHarness({
      ...fixture,
      answers: { decision: { type: "noul", value: true } },
    });

    await expect(decide(options)).rejects.toThrow(/Unexpected Decisions answer/);
  });
});
