import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { ModelId } from "models";
import type { InferenceClients } from "../../src/types";

/**
 * `ToolLoopAgent` keeps its constructor settings private (only `id`/`tools`
 * are public getters), so the only way to assert the resolved model,
 * instructions and overrides actually reached the constructor is to spy on
 * it directly: a subclass that records `settings` and delegates to the real
 * implementation via `super(...)`, so agent behaviour itself is untouched.
 *
 * `tracing` is mocked outright (the repo's existing convention — see
 * `packages/coding-agent/tests/unit/turn-runner.test.ts`) so this test never
 * touches a real trace sink (no file I/O) and can assert exactly what
 * `createAgent` passes to `wrapWithTracing`.
 */
const state = vi.hoisted(() => ({
  agentSettings: [] as Array<Record<string, unknown>>,
  tracingCalls: [] as Array<{ model: unknown; runId: string }>,
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  class SpyToolLoopAgent extends actual.ToolLoopAgent {
    constructor(settings: Record<string, unknown>) {
      state.agentSettings.push(settings);
      super(settings as any);
    }
  }
  return { ...actual, ToolLoopAgent: SpyToolLoopAgent };
});

vi.mock("tracing", () => ({
  wrapWithTracing: vi.fn((model: unknown, runId: string) => {
    state.tracingCalls.push({ model, runId });
    return { wrapped: true, of: model };
  }),
}));

const { createInferenceKit } = await import("../../src/kit");
const { ToolLoopAgent } = await import("ai");

const stubModel = (modelId: string): LanguageModelV3 =>
  ({ modelId, specificationVersion: "v3" }) as unknown as LanguageModelV3;

function stubClients(overrides: Partial<InferenceClients> = {}): InferenceClients {
  const kinds: Array<keyof InferenceClients> = [
    "opencodeGo",
    "opencodeGoResponses",
    "opencodeGoAnthropic",
    "opencodeZen",
    "gateway",
    "openrouter",
    "openai",
    "xai",
    "groq",
    "perplexity",
    "lmstudio",
    "deepinfra",
  ];
  const base = Object.fromEntries(
    kinds.map((kind) => [kind, vi.fn((modelId: string) => stubModel(modelId))]),
  ) as unknown as InferenceClients;
  return { ...base, ...overrides };
}

beforeEach(() => {
  state.agentSettings.length = 0;
  state.tracingCalls.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createAgent", () => {
  it("resolves a role via languageModel, traces the model, and builds a ToolLoopAgent", () => {
    const kit = createInferenceKit({ clients: stubClients() });
    const base = kit.languageModel("chatTitle");
    const tools = {};

    const agent = kit.createAgent("chatTitle", {
      instructions: "be terse",
      tools,
      overrides: { maxRetries: 2 },
    });

    expect(agent).toBeInstanceOf(ToolLoopAgent);
    expect(agent.tools).toBe(tools);

    // Traced with the *raw* (pre-trace) model and the default run id.
    expect(state.tracingCalls).toEqual([{ model: base.model, runId: "default" }]);

    // The constructed ToolLoopAgent got the rest of the base configuration
    // (company, temperature, …) plus instructions/tools/overrides, and the
    // *traced* model (whatever wrapWithTracing returned), not the raw one.
    expect(state.agentSettings).toHaveLength(1);
    expect(state.agentSettings[0]).toMatchObject({
      instructions: "be terse",
      tools,
      maxRetries: 2,
      company: base.company,
      model: { wrapped: true, of: base.model },
    });
  });

  it("resolves a role to the same underlying (pre-trace) model as its literal id", () => {
    const kit = createInferenceKit({ clients: stubClients() });

    kit.createAgent("chatTitle");
    kit.createAgent("Llama 3.1 Instant" as ModelId);

    expect(state.tracingCalls).toHaveLength(2);
    expect(state.tracingCalls[0]!.model).toBe(state.tracingCalls[1]!.model);
  });

  it("uses TRACE_RUN_ID when set, and falls back to \"default\" otherwise", () => {
    vi.stubEnv("TRACE_RUN_ID", "run-123");
    const kit = createInferenceKit({ clients: stubClients() });

    kit.createAgent("chatTitle");

    expect(state.tracingCalls[0]?.runId).toBe("run-123");
  });

  it("works with no options at all (instructions/tools/overrides all omitted)", () => {
    const kit = createInferenceKit({ clients: stubClients() });

    expect(() => kit.createAgent("imageEdit")).not.toThrow();
    expect(state.agentSettings[0]).toMatchObject({
      instructions: undefined,
      tools: undefined,
    });
  });
});
