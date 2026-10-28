/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { HttpResponse, delay, http } from "msw";
import { textReply } from "@ai-chatbot/model-gateway-testing";
import type {
  ChatRequest,
  GatewayScenario,
} from "@ai-chatbot/model-gateway-testing";
import { setupGatewayHarness } from "../../helpers/gateway-harness";
import {
  answerDecision,
  answerDecisionRaw,
  answerDecisionWith,
} from "../../helpers/gateway-decisions";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { DEFAULT_PROJECT_AGENT_PROMPT } from "@/lib/features/chat/chat-modes/prompts";
import { WEB_SEARCH_TOOL } from "@/lib/features/web-search/constants";
import { TEST_MODELS } from "@/tests/mocks/gateway/catalog";
import { CHAT_MODE_ROUTING_QUESTION_KEY } from "@/lib/features/chat/mode-routing/router";

vi.mock("server-only", () => ({}));

// Memory retrieval/extraction are DB + embeddings collaborators, covered by
// their own suites; this file is about the turn's routing and the agent it
// builds. Everything inference-related is REAL: the kit resolves the model and
// streams through MSW to the Gateway HTTP seam (ADR 0013). No AI port, no
// in-process model fake.
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
const SELECTED_MODEL = TEST_MODELS[0]!.id;

const answering = (choice: string) =>
  answerDecision(CHAT_MODE_ROUTING_QUESTION_KEY, choice);

const answeringWith = (choice: string, answer: Record<string, unknown>) =>
  answerDecisionWith(CHAT_MODE_ROUTING_QUESTION_KEY, choice, answer);

const userMessage = (text: string): ChatbotMessage => ({
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text }],
});

/** The recorded `POST /v1/chat/completions` bodies, oldest first. */
const chatBodies = (scenario: GatewayScenario): ChatRequest[] =>
  scenario.requests
    .filter((request) => request.path === "/v1/chat/completions")
    .map((request) => request.body as ChatRequest);

const systemContent = (body: ChatRequest): string =>
  (body.messages ?? [])
    .filter((message) => message.role === "system")
    .map((message) =>
      typeof message.content === "string" ? message.content : "",
    )
    .join("\n");

const toolNames = (body: ChatRequest): string[] =>
  ((body.tools ?? []) as Array<{ function?: { name?: string } }>).map(
    (tool) => tool.function?.name ?? "",
  );

const runTurn = async ({
  temperature,
  topP,
}: {
  temperature?: number;
  topP?: number;
} = {}) => {
  const stream = await processChatResponse({
    messages: [userMessage("hello, tell me something")],
    selectedModel: SELECTED_MODEL,
    temperature,
    topP,
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

describe("neutral branch through the conversation pipeline", () => {
  it("answers a `neither` decision with no tools at all", async () => {
    const scenario = await gateway.use({
      decisions: answering("neither"),
      chat: () => textReply("Neutral reply"),
    });

    const { chunkTypes, text, routing } = await runTurn({
      temperature: 0.42,
      topP: 0.8,
    });

    // The message routed to the neutral branch through the Decisions answer:
    // one call, asking for the routing question with the turn's message.
    const decisions = scenario.requests.filter(
      (request) => request.path === "/v1/systemone",
    );
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.body).toMatchObject({
      model: "decision-default",
      state: { latest_message: "hello, tell me something" },
    });

    expect(chunkTypes.filter((type) => type.startsWith("tool-"))).toEqual([]);
    expect(text).toBe("Neutral reply");
    // The routing metadata the stream announces carries the Decisions
    // provenance, not a fixture.
    expect(routing).toMatchObject({
      requested: "auto",
      mode: "neutral",
      reason: "neither",
      confidence: 1,
      modelId: "decision-default",
    });

    // The generation request: the user-selected model, the turn's parameters
    // over the catalog's own defaults, the tool-less neutral instructions.
    const [body] = chatBodies(scenario);
    expect(body!.model).toBe(SELECTED_MODEL);
    expect(body!.temperature).toBe(0.42);
    expect(body).toHaveProperty("top_p", 0.8);
    expect(toolNames(body!)).toEqual([]);
    expect(systemContent(body!)).toBe(DEFAULT_PROJECT_AGENT_PROMPT);
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
      const scenario = await gateway.use({
        ...use(),
        chat: () => textReply("Neutral reply"),
      });

      try {
        const { chunkTypes, text, routing } = await runTurn();

        expect(routing).toMatchObject({
          requested: "auto",
          mode: "neutral",
          reason: "fallback",
        });
        expect(chunkTypes.filter((type) => type.startsWith("tool-"))).toEqual([]);
        expect(text).toBe("Neutral reply");
        expect(toolNames(chatBodies(scenario)[0]!)).toEqual([]);
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
    await gateway.use({
      decisions: answering("ctx7"),
      chat: () => textReply("Neutral reply"),
    });
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
      expect(text).toBe("Neutral reply");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("applies a low-confidence classifier decision as-is (no gate)", async () => {
    const scenario = await gateway.use({
      decisions: answeringWith("web", { confidence: 0.42 }),
      chat: () => textReply("Neutral reply"),
    });

    const { routing, text } = await runTurn();

    expect(routing).toMatchObject({
      requested: "auto",
      mode: "web",
      reason: "routed",
      confidence: 0.42,
    });
    expect(text).toBe("Neutral reply");
    // The resolved mode, not the requested one, builds the agent.
    expect(toolNames(chatBodies(scenario)[0]!)).toEqual([WEB_SEARCH_TOOL]);
  });

  it("routes a valid answer without confidence instead of gating it", async () => {
    await gateway.use({
      decisions: answeringWith("web", { confidence: undefined }),
      chat: () => textReply("Neutral reply"),
    });

    const { routing, text } = await runTurn();

    expect(routing).toMatchObject({
      requested: "auto",
      mode: "web",
      reason: "routed",
    });
    expect(text).toBe("Neutral reply");
  });
});
