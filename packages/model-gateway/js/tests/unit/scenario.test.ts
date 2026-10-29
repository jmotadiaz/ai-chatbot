import { describe, expect, it } from "vitest";
import {
  GatewayScenarioError,
  createGatewayScenario,
  decisionsResponse,
  errorBody,
  textReply,
  toolCallReply,
  toolResultReply,
  type GatewayResult,
} from "../../src/index";

const AUTH = { Authorization: "Bearer test-key" } as const;

function json(result: GatewayResult) {
  if (result.kind !== "json") throw new Error(`expected a JSON result, got ${result.kind}`);
  return result;
}

const post = (scenario: ReturnType<typeof createGatewayScenario>, path: string, body: unknown) =>
  json(
    scenario.handle("POST", path, {
      body: JSON.stringify(body),
      headers: AUTH,
    }),
  );

describe("recorded requests", () => {
  it("records method, path, headers and the parsed body", () => {
    const scenario = createGatewayScenario({ chat: () => textReply("hi") });
    post(scenario, "/v1/chat/completions", { model: "basicChat", messages: [] });

    expect(scenario.requests).toHaveLength(1);
    expect(scenario.requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/chat/completions",
      headers: AUTH,
      body: { model: "basicChat", messages: [] },
    });
  });

  it("keeps the raw string when the body is not JSON", () => {
    const scenario = createGatewayScenario({ chat: () => textReply("hi") });
    scenario.handle("POST", "/v1/chat/completions", {
      body: "not-json",
      headers: AUTH,
    });
    expect(scenario.requests[0]!.body).toBe("not-json");
  });

  it("records the query string of a request", () => {
    const scenario = createGatewayScenario({ catalog: { public: [] } });
    json(scenario.handle("GET", "/v1/models/catalog?include_internal=true", { headers: AUTH }));
    expect(scenario.requests[0]!.path).toBe("/v1/models/catalog?include_internal=true");
  });

  it("isolates state between instances and resets only the target", () => {
    const first = createGatewayScenario({ chat: () => textReply("first") });
    const second = createGatewayScenario({ chat: () => textReply("second") });

    post(first, "/v1/chat/completions", { model: "a" });
    post(second, "/v1/chat/completions", { model: "b" });
    expect(first.requests).toHaveLength(1);
    expect(second.requests).toHaveLength(1);
    expect(first.requests[0]!.body).toMatchObject({ model: "a" });

    first.reset();
    expect(first.requests).toHaveLength(0);
    expect(second.requests).toHaveLength(1);
  });
});

describe("authentication and probe", () => {
  it("answers the health probe without a bearer and does not record it", () => {
    const scenario = createGatewayScenario({});
    const result = json(scenario.handle("GET", "/__mock-gateway/health"));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ mock: "model-gateway" });
    expect(scenario.requests).toHaveLength(0);
  });

  it("rejects every operation without an Authorization header", () => {
    const scenario = createGatewayScenario({});
    for (const [method, path] of [
      ["GET", "/v1/models/catalog"],
      ["POST", "/v1/chat/completions"],
      ["POST", "/v1/embeddings"],
      ["POST", "/v1/rerank"],
      ["POST", "/v1/decisions"],
      ["POST", "/v1/systemone"],
      ["POST", "/v1/audio/speech"],
    ] as const) {
      const result = json(scenario.handle(method, path, { body: "{}" }));
      expect(result.status, path).toBe(401);
      expect(result.body).toMatchObject({ error: { type: "auth_error" } });
    }
  });

  it("accepts any non-empty bearer and a custom authorizer", () => {
    const scenario = createGatewayScenario({ catalog: { public: [] } });
    expect(
      json(scenario.handle("GET", "/v1/models/catalog", {
        headers: { authorization: "Bearer anything" },
      })).status,
    ).toBe(200);

    const strict = createGatewayScenario({
      catalog: { public: [] },
      authorize: (headers) => headers.authorization === "Bearer expected",
    });
    expect(
      json(strict.handle("GET", "/v1/models/catalog", {
        headers: { authorization: "Bearer other" },
      })).status,
    ).toBe(401);
  });
});

describe("explicit errors", () => {
  it("404 with a message on unknown routes", () => {
    const scenario = createGatewayScenario({});
    const result = json(scenario.handle("GET", "/v1/unknown", { headers: AUTH }));
    expect(result.status).toBe(404);
    expect(result.body).toEqual(errorBody("Unknown route: GET /v1/unknown", "not_found"));
  });

  it("422 unsupported_model when the chat responder declines a model", () => {
    const scenario = createGatewayScenario({
      chat: (request) => (request.model === "known" ? textReply("ok") : undefined),
    });
    const unsupported = post(scenario, "/v1/chat/completions", { model: "unknown" });
    expect(unsupported.status).toBe(422);
    expect(unsupported.body).toEqual(
      errorBody("Unsupported model: unknown", "unsupported_model"),
    );

    expect(
      post(scenario, "/v1/chat/completions", { model: "known" }).body,
    ).toMatchObject({ choices: [{ message: { content: "ok" } }] });
  });

  it("422 unsupported_operation when an operation has no responder", () => {
    const scenario = createGatewayScenario({});
    for (const path of [
      "/v1/chat/completions",
      "/v1/embeddings",
      "/v1/rerank",
      "/v1/decisions",
      "/v1/audio/speech",
    ]) {
      const result = post(scenario, path, {});
      expect(result.status, path).toBe(422);
      expect(result.body).toMatchObject({ error: { type: "unsupported_operation" } });
    }
    expect(json(scenario.handle("GET", "/v1/models/catalog", { headers: AUTH })).status).toBe(422);
  });

  it("renders responder-thrown scenario errors with their status and type", () => {
    const scenario = createGatewayScenario({
      embeddings: () => {
        throw new GatewayScenarioError("Embeddings are not configured", 503, "unavailable");
      },
    });
    const result = post(scenario, "/v1/embeddings", {});
    expect(result.status).toBe(503);
    expect(result.body).toEqual(errorBody("Embeddings are not configured", "unavailable"));
  });

  it("signals invalid scenario configuration instead of a generic success", () => {
    const badAuthorize = createGatewayScenario({
      catalog: { public: [] },
      // Deliberately invalid: the authorizer must be a boolean predicate.
      authorize: (() => "yes") as unknown as () => boolean,
    });
    const authorizeResult = json(
      badAuthorize.handle("GET", "/v1/models/catalog", { headers: AUTH }),
    );
    expect(authorizeResult.status).toBe(500);
    expect(authorizeResult.body).toMatchObject({
      error: { type: "invalid_scenario_configuration" },
    });

    const badChat = createGatewayScenario({
      chat: (() => ({ json: "nope" })) as unknown as () => never,
    });
    const chatResult = post(badChat, "/v1/chat/completions", { model: "x" });
    expect(chatResult.status).toBe(500);
    expect(chatResult.body).toMatchObject({
      error: { type: "invalid_scenario_configuration" },
    });
  });

  it("renders unexpected responder failures as explicit 500 errors", () => {
    const scenario = createGatewayScenario({
      rerank: () => {
        throw new Error("responder exploded");
      },
    });
    const result = post(scenario, "/v1/rerank", {});
    expect(result.status).toBe(500);
    expect(result.body).toEqual(errorBody("responder exploded", "scenario_error"));
  });
});

describe("operations and catalogs", () => {
  it("filters the consumer-owned catalog by the include_internal flag", () => {
    const scenario = createGatewayScenario({
      catalog: { public: [{ id: "basic" }], internal: [{ id: "fast-default" }] },
    });
    const isIncluded = (result: GatewayResult) =>
      (json(result).body as { models: Array<{ id: string }> }).models.map((model) => model.id);

    expect(isIncluded(scenario.handle("GET", "/v1/models/catalog", { headers: AUTH }))).toEqual([
      "basic",
    ]);
    expect(
      isIncluded(
        scenario.handle("GET", "/v1/models/catalog?include_internal=false", { headers: AUTH }),
      ),
    ).toEqual(["basic"]);
    expect(
      isIncluded(
        scenario.handle("GET", "/v1/models/catalog?include_internal=true", { headers: AUTH }),
      ),
    ).toEqual(["basic", "fast-default"]);
  });

  it("serves both decisions routes through one responder", () => {
    const scenario = createGatewayScenario({
      decisions: (request) => decisionsResponse(request),
    });
    for (const path of ["/v1/decisions", "/v1/systemone"]) {
      const result = post(scenario, path, {
        model: "decision-default",
        questions: { q: { type: "choice", criteria: { a: "A", b: "B" } } },
      });
      expect(result.status, path).toBe(200);
      expect(result.body).toMatchObject({ answers: { q: { choice: "a" } } });
    }
    expect(scenario.requests.map((request) => request.path)).toEqual([
      "/v1/decisions",
      "/v1/systemone",
    ]);
  });
});

describe("tool continuations", () => {
  /**
   * The responder derives the turn from the received history, exactly like the
   * packaged consumers: no first/second-call counter, no queue. Interleaving and
   * repeating requests in any order must not drift.
   */
  const scenario = createGatewayScenario({
    chat: (request) =>
      request.messages?.at(-1)?.role === "tool"
        ? toolResultReply("done")
        : toolCallReply({ calls: [{ id: "call-1", name: "tool", arguments: "{}" }] }),
  });

  const textOf = (result: GatewayResult): string => {
    const body = json(result).body as {
      choices: Array<{
        message: { content: string };
        finish_reason: string;
      }>;
    };
    expect(body.choices[0]!.finish_reason).toBe("stop");
    return body.choices[0]!.message.content;
  };

  it("answers from the request history in any order", () => {
    const toolHistory = { messages: [{ role: "tool", content: "result" }], stream: true };
    const userHistory = { messages: [{ role: "user", content: "question" }], stream: true };

    const streamText = (result: GatewayResult): string => {
      if (result.kind !== "sse") throw new Error("expected sse");
      return result.events
        .map((event) => event.frame)
        .filter((frame) => frame.startsWith("data: ") && !frame.includes("[DONE]"))
        .map((frame) => JSON.parse(frame.slice(6)) as {
          choices: Array<{ delta: { content?: string } }>;
        })
        .map((chunk) => chunk.choices[0]!.delta.content ?? "")
        .join("");
    };

    expect(
      streamText(scenario.handle("POST", "/v1/chat/completions", {
        body: JSON.stringify(toolHistory),
        headers: AUTH,
      })),
    ).toBe("done");
    expect(
      streamText(scenario.handle("POST", "/v1/chat/completions", {
        body: JSON.stringify(userHistory),
        headers: AUTH,
      })),
    ).toBe("");
    // Repeating the first call keeps answering with the tool call, not a counter.
    const repeated = scenario.handle("POST", "/v1/chat/completions", {
      body: JSON.stringify(userHistory),
      headers: AUTH,
    });
    if (repeated.kind !== "sse") throw new Error("expected sse");
    expect(repeated.events.some((event) => event.frame.includes("tool_calls"))).toBe(true);

    // And the non-streaming rendering of a tool result stays the final text.
    expect(textOf(scenario.handle("POST", "/v1/chat/completions", {
      body: JSON.stringify({ messages: toolHistory.messages }),
      headers: AUTH,
    }))).toBe("done");
  });
});
