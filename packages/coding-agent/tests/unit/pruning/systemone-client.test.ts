import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGatewayScenario,
  decisionsResponse,
  type DecisionsRequest,
  type GatewayScenarioConfig,
} from "@ai-chatbot/model-gateway-testing";
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  type ToolPruningConfig,
} from "../../../src/pruning/config";
import {
  NO_PHASE0_SIGNALS,
  applyDecisionPolicy,
  type DecisionCandidate,
  type DecisionQuestion,
} from "../../../src/pruning/decision-state";
import {
  DECISION_MODEL,
  requestSystemOneDecision,
  type SystemOneDecisionRequest,
} from "../../../src/pruning/systemone-client";

const BASE_URL = "http://127.0.0.1:4099/v1";
const API_KEY = "test-gateway-key";

/** The MSW seam: the real `fetch` runs, the toolkit answers in-process. */
const server = setupServer();

beforeEach(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.close();
});

const useScenario = (config: GatewayScenarioConfig) => {
  const scenario = createGatewayScenario(config);
  server.use(...scenario.handlers);
  return scenario;
};

const configWith = (overrides: Partial<ToolPruningConfig>): ToolPruningConfig => ({
  ...DEFAULT_TOOL_PRUNING_CONFIG,
  ...overrides,
});

const question = (instructions: string): DecisionQuestion => ({
  type: "noul",
  instructions,
  criteria: { true: "Keep it.", false: "Drop it." },
});

const request: SystemOneDecisionRequest = {
  state: {
    goal: { request: "Implement the parser", previous: [] },
    timeline: { turns: [], candidates: [] },
  },
  questions: {
    result_c1: question("Is the read result still needed?"),
    call_c1: question("Is the read call trace still needed?"),
  },
};

const candidate = (id: string): DecisionCandidate => ({
  id,
  toolCallId: `call-${id}`,
  toolName: "read",
  arguments: { path: "src/app.ts" },
  chars: 4_000,
  tokensEst: 1_000,
  resultTokens: 950,
  callTokens: 50,
  isError: false,
  resultIndex: 0,
  eligibility: { dropResult: true, dropCall: true, requiresSupersessionOrJudge: false },
  signals: NO_PHASE0_SIGNALS,
  resultText: "x".repeat(4_000),
});

describe("requestSystemOneDecision", () => {
  it("posts the state and noul questions to the Gateway and returns the probabilities", async () => {
    const scenario = useScenario({
      decisions: (body) =>
        decisionsResponse(body as DecisionsRequest, { nouls: { result_c1: 0.12 } }),
    });

    const result = await requestSystemOneDecision(request, {
      baseUrl: BASE_URL,
      apiKey: API_KEY,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers).toEqual({ result_c1: 0.12, call_c1: 0.5 });
    expect(result.model).toBe(DECISION_MODEL);
    expect(result.provider).toBe("mock-model-gateway");
    expect(result.cost).toBe(0);

    const recorded = scenario.requests.at(-1);
    expect(recorded?.path).toBe("/v1/systemone");
    expect(recorded?.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(recorded?.body).toMatchObject({
      model: DECISION_MODEL,
      state: request.state,
      questions: request.questions,
    });
  });

  it("keeps extra headers from getApiKeyAndHeaders but never lets them shadow the api key", async () => {
    const scenario = useScenario({
      decisions: (body) => decisionsResponse(body as DecisionsRequest),
    });

    await requestSystemOneDecision(request, {
      baseUrl: `${BASE_URL}/`,
      apiKey: API_KEY,
      headers: { "x-request-source": "tool-pruning", authorization: "Bearer stale" },
    });

    const recorded = scenario.requests.at(-1);
    expect(recorded?.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(recorded?.headers["x-request-source"]).toBe("tool-pruning");
  });

  it("reports a timeout as a typed failure after decisionTimeoutMs", async () => {
    server.use(
      http.post("*/v1/systemone", async () => {
        await sleep(150);
        return HttpResponse.json({ answers: {} });
      }),
    );

    const startedAt = Date.now();
    const result = await requestSystemOneDecision(request, {
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      config: configWith({ decisionTimeoutMs: 20 }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("timeout");
    expect(Date.now() - startedAt).toBeLessThan(120);
  });

  it("reports an aborted Turn as a typed failure and cancels the request", async () => {
    server.use(
      http.post("*/v1/systemone", async () => {
        await sleep(150);
        return HttpResponse.json({ answers: {} });
      }),
    );
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);

    const result = await requestSystemOneDecision(request, {
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      signal: controller.signal,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("aborted");
  });

  it("treats a non-JSON body as an invalid response", async () => {
    server.use(
      http.post(
        "*/v1/systemone",
        () =>
          new HttpResponse("not json", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const result = await requestSystemOneDecision(request, {
      baseUrl: BASE_URL,
      apiKey: API_KEY,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_response");
  });

  it("treats a body without an answers object as an invalid response", async () => {
    server.use(
      http.post("*/v1/systemone", () => HttpResponse.json({ model: DECISION_MODEL })),
    );

    const result = await requestSystemOneDecision(request, {
      baseUrl: BASE_URL,
      apiKey: API_KEY,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_response");
  });

  it("reports an HTTP error status as a typed failure", async () => {
    server.use(
      http.post("*/v1/systemone", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );

    const result = await requestSystemOneDecision(request, {
      baseUrl: BASE_URL,
      apiKey: API_KEY,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("http_error");
    expect(result.status).toBe(500);
  });

  it("defaults a missing key to probability 1.0 (keep) in the policy", async () => {
    // The judge answered only the result question: `call_c1` is absent.
    server.use(
      http.post("*/v1/systemone", () =>
        HttpResponse.json({
          answers: { result_c1: { type: "noul", noul: 0.1 } },
          model: DECISION_MODEL,
        }),
      ),
    );

    const result = await requestSystemOneDecision(request, {
      baseUrl: BASE_URL,
      apiKey: API_KEY,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers).toEqual({ result_c1: 0.1 });

    const decisions = applyDecisionPolicy([candidate("c1")], result.answers, {
      mode: "normal",
      activeTokens: 50_000,
      contextWindow: 100_000,
    });
    // keepCall defaults to 1.0, so the exploratory call cannot be dropped; only
    // the result body goes.
    expect(decisions.decisions).toEqual({ "call-c1": "drop_result" });
  });

  it("omits out-of-range answers so the policy keeps the candidate", async () => {
    server.use(
      http.post("*/v1/systemone", () =>
        HttpResponse.json({
          answers: {
            result_c1: { type: "noul", noul: 3 },
            call_c1: { type: "noul", noul: 0.1 },
          },
        }),
      ),
    );

    const result = await requestSystemOneDecision(request, {
      baseUrl: BASE_URL,
      apiKey: API_KEY,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers).toEqual({ call_c1: 0.1 });

    const decisions = applyDecisionPolicy([candidate("c1")], result.answers, {
      mode: "normal",
      activeTokens: 50_000,
      contextWindow: 100_000,
    });
    expect(decisions.decisions).toEqual({});
    expect(decisions.kept).toEqual(["call-c1"]);
  });

  it("keeps every candidate when the judge answers nothing", async () => {
    server.use(
      http.post("*/v1/systemone", () => HttpResponse.json({ answers: {} })),
    );

    const result = await requestSystemOneDecision(request, {
      baseUrl: BASE_URL,
      apiKey: API_KEY,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers).toEqual({});

    const decisions = applyDecisionPolicy([candidate("c1")], result.answers, {
      mode: "normal",
      activeTokens: 50_000,
      contextWindow: 100_000,
    });
    expect(decisions.decisions).toEqual({});
    expect(decisions.kept).toEqual(["call-c1"]);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
