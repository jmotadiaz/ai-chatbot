/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpResponse, delay, http } from "msw";
import { setupGatewayHarness } from "../../helpers/gateway-harness";
import {
  answerDecision,
  answerDecisionRaw,
  answerDecisionWith,
} from "../../helpers/gateway-decisions";
import type { LanguageModelV3CallOptions } from "@/lib/infrastructure/ai/types";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { TEST_MODELS } from "@/tests/mocks/gateway/catalog";
import { CHAT_MODE_ROUTING_QUESTION_KEY } from "@/lib/features/chat/mode-routing/router";

vi.mock("server-only", () => ({}));

// `vi.hoisted` so the mock factory below can share the recorded calls with the
// test body (the factory runs before the dynamic import of the conversation
// factory, which is what lets the AI port be built from this mock model).
const state = vi.hoisted(() => ({
  calls: [] as LanguageModelV3CallOptions[],
}));

// The user-selected model + parameters are what this suite asserts on, so the
// model stays an in-process fake (the three kit members `buildAgentAdapter`
// calls). `decide` — and with it the whole Chat Mode Router — is the REAL
// composition root member, so the branch under test is chosen by a Decisions
// answer served over HTTP, exactly as in production.
vi.mock("@/lib/infrastructure/ai/inference-kit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/infrastructure/ai/inference-kit")>();
  const { MockLanguageModelV3 } = await import("ai/test");
  const { simulateReadableStream, ToolLoopAgent } = await import("ai");
  const { textChunks, finishChunk } = await import("../../helpers/stream-chunks");

  const model = new MockLanguageModelV3({
    modelId: "user-selected-model",
    doStream: async (options) => {
      state.calls.push(options);
      return {
        stream: simulateReadableStream({
          chunks: [
            ...textChunks("text-1", "Respuesta neutra"),
            finishChunk("stop"),
          ],
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
  });

  // No tracing wrap here (this fake stands in for the untraced base
  // configuration): TRACE_ENABLED is unset in this suite, so the real kit's
  // own `wrapWithTracing` would no-op identically.
  const baseConfig = () => ({
    model,
    company: "openai" as const,
    temperature: 0.2,
    topP: 0.8,
  });

  return {
    inferenceKit: {
      ...actual.inferenceKit,
      languageModel: baseConfig,
      createAgentModel: baseConfig,
      createAgent: (
        _idOrRole: unknown,
        { instructions, tools, overrides }: any = {},
      ) =>
        new ToolLoopAgent({
          ...baseConfig(),
          instructions,
          tools,
          ...overrides,
        }),
    },
  };
});

vi.mock("@/lib/features/memory/retrieval", () => ({
  getRelevantMemory: async () => null,
}));

vi.mock("@/lib/features/memory/extraction", () => ({
  extractMemoryFacts: async () => [],
}));

const { makeProcessChatResponse } = await import(
  "@/lib/features/chat/conversation/factory"
);
const { inferenceKit } = await import("@/lib/infrastructure/ai/inference-kit");
const { createChatModeRouter } = await import(
  "@/lib/features/chat/mode-routing/router"
);

const gateway = setupGatewayHarness();

/** The composition root's real router: `createChatModeRouter(decide)`. */
const processChatResponse = makeProcessChatResponse(
  createChatModeRouter(inferenceKit.decide),
);

const USER_ID = "11111111-1111-1111-1111-111111111111";

const answering = (choice: string) =>
  answerDecision(CHAT_MODE_ROUTING_QUESTION_KEY, choice);

const answeringWith = (choice: string, answer: Record<string, unknown>) =>
  answerDecisionWith(CHAT_MODE_ROUTING_QUESTION_KEY, choice, answer);

const userMessage = (text: string): ChatbotMessage => ({
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text }],
});

const runTurn = async ({ temperature }: { temperature?: number } = {}) => {
  const stream = await processChatResponse({
    messages: [userMessage("hola, cuéntame algo")],
    selectedModel: TEST_MODELS[0]!.id,
    temperature,
    chatMode: "auto",
    preventChatPersistence: true,
    user: { id: USER_ID },
  });

  const chunks: any[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return {
    chunkTypes: chunks.map((chunk) => chunk.type as string),
    text: chunks
      .filter((chunk) => chunk.type === "text-delta")
      .map((chunk) => chunk.delta)
      .join(""),
    routing: chunks
      .map((chunk) =>
        chunk.type === "start" || chunk.type === "message-metadata"
          ? chunk.messageMetadata?.chatModeRouting
          : undefined,
      )
      .filter(Boolean)
      .at(-1),
  };
};

beforeEach(() => {
  state.calls.length = 0;
});

describe("neutral branch through the conversation pipeline", () => {
  it("answers a `neither` decision with no tools at all", async () => {
    const scenario = await gateway.use({ decisions: answering("neither") });

    const { chunkTypes, text, routing } = await runTurn({ temperature: 0.42 });

    // The message routed to the neutral branch through the Decisions answer:
    // one call, asking for the routing question with the turn's message.
    const decisions = scenario.requests.filter(
      (request) => request.path === "/v1/systemone",
    );
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.body).toMatchObject({
      model: "decision-default",
      state: { latest_message: "hola, cuéntame algo" },
    });

    expect(chunkTypes.filter((type) => type.startsWith("tool-"))).toEqual([]);
    expect(text).toBe("Respuesta neutra");
    // The routing metadata the stream announces carries the Decisions
    // provenance, not a fixture.
    expect(routing).toMatchObject({
      requested: "auto",
      mode: "neutral",
      reason: "neither",
      confidence: 1,
      modelId: "decision-default",
    });

    // The model was never offered a tool, and kept the user's parameters.
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]!.tools ?? []).toEqual([]);
    expect(state.calls[0]!.temperature).toBe(0.42);
    expect(state.calls[0]!.topP).toBe(0.8);
  });

  it.each([
    {
      name: "a Decisions transport error",
      use: () => ({
        decisions: () => {
          throw new Error("decisions backend down");
        },
      }),
    },
    {
      name: "an invalid Decisions answer",
      use: () => ({
        decisions: answerDecisionRaw({
          answers: {
            [CHAT_MODE_ROUTING_QUESTION_KEY]: {
              type: "choice",
              choice: "banana",
              confidence: 1,
            },
          },
          model: "decision-default",
        }),
      }),
    },
  ])(
    "degrades to the neutral fallback when routing fails: $name",
    async ({ use }) => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      await gateway.use(use());

      try {
        const { chunkTypes, text, routing } = await runTurn();

        expect(routing).toMatchObject({
          requested: "auto",
          mode: "neutral",
          reason: "fallback",
        });
        expect(chunkTypes.filter((type) => type.startsWith("tool-"))).toEqual([]);
        expect(text).toBe("Respuesta neutra");
        expect(state.calls[0]!.tools ?? []).toEqual([]);
      } finally {
        consoleError.mockRestore();
      }
    },
  );

  // A scenario responder is synchronous, so a response slower than the kit's
  // `DECIDE_TIMEOUT_MS` is expressed with an ad-hoc MSW handler ahead of the
  // scenario's catch-all.
  it("degrades to the neutral fallback when the Decisions call times out", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await gateway.use({ decisions: answering("ctx7") });
    gateway.server.use(
      http.post("*/v1/systemone", async () => {
        await delay(2_000);
        return HttpResponse.json({ answers: {} });
      }),
    );

    try {
      const { routing, text } = await runTurn();

      expect(routing).toMatchObject({
        requested: "auto",
        mode: "neutral",
        reason: "fallback",
      });
      expect(text).toBe("Respuesta neutra");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("applies a low-confidence classifier decision as-is (no gate)", async () => {
    await gateway.use({
      decisions: answeringWith("web", { confidence: 0.42 }),
    });

    const { routing, text } = await runTurn();

    expect(routing).toMatchObject({
      requested: "auto",
      mode: "web",
      reason: "routed",
      confidence: 0.42,
    });
    expect(text).toBe("Respuesta neutra");
  });

  it("routes a valid answer without confidence instead of gating it", async () => {
    await gateway.use({
      decisions: answeringWith("web", { confidence: undefined }),
    });

    const { routing, text } = await runTurn();

    expect(routing).toMatchObject({
      requested: "auto",
      mode: "web",
      reason: "routed",
    });
    expect(text).toBe("Respuesta neutra");
  });
});
