import { describe, expect, it, vi } from "vitest";
import { HttpResponse, delay, http } from "msw";
import { setupGatewayHarness } from "../../../helpers/gateway-harness";
import {
  answerDecision,
  answerDecisionRaw,
  answerDecisionWith,
} from "../../../helpers/gateway-decisions";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import {
  buildChatModeRouterInput,
  FALLBACK_CHAT_MODE_DECISION,
  resolveChatMode,
} from "@/lib/features/chat/mode-routing";
import {
  CHAT_MODE_ROUTING_QUESTION_KEY,
  createChatModeRouter,
} from "@/lib/features/chat/mode-routing/router";

/**
 * Fallback policy of `resolveChatMode` and the pure Router Input derivation.
 *
 * The policy cases go through the REAL composition (`createChatModeRouter` over
 * `inferenceKit.decide`) and the official toolkit at the MSW seam, so "the
 * classifier failed" means a real Decisions transport condition — an HTTP
 * error, a timeout past `DECIDE_TIMEOUT_MS`, or a payload the kit refuses —
 * instead of a fake port handing back a fixture. Nothing here needs a gateway
 * listening on `:4001`.
 */
vi.mock("server-only", () => ({}));

const gateway = setupGatewayHarness();

const router = createChatModeRouter(inferenceKit.decide);

const input = { latestMessage: "¿Cómo uso drizzle-kit?", recentContext: "" };

const answering = (choice: string) =>
  answerDecision(CHAT_MODE_ROUTING_QUESTION_KEY, choice);

const answeringWith = (choice: string, answer: Record<string, unknown>) =>
  answerDecisionWith(CHAT_MODE_ROUTING_QUESTION_KEY, choice, answer);

const answeringRaw = answerDecisionRaw;

const resolve = () => resolveChatMode(router, input);

describe("resolveChatMode over the Gateway HTTP seam", () => {
  it("applies a well-formed decision as-is (no confidence gate)", async () => {
    await gateway.use({
      decisions: answeringWith("ctx7", { confidence: 0.42 }),
    });

    await expect(resolve()).resolves.toMatchObject({
      requested: "auto",
      mode: "context7",
      reason: "routed",
      confidence: 0.42,
      modelId: "decision-default",
    });
  });

  it("keeps an explicit neutral decision as neither", async () => {
    await gateway.use({ decisions: answering("neither") });

    await expect(resolve()).resolves.toMatchObject({
      requested: "auto",
      mode: "neutral",
      reason: "neither",
      modelId: "decision-default",
    });
  });

  it("never throws: a Decisions transport error degrades to the neutral fallback", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await gateway.use({
      decisions: () => {
        throw new Error("decisions backend down");
      },
    });

    try {
      await expect(resolve()).resolves.toEqual({
        ...FALLBACK_CHAT_MODE_DECISION,
        requested: "auto",
      });
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  // A scenario responder is synchronous, so a response slower than the kit's
  // `DECIDE_TIMEOUT_MS` (1500 ms) is expressed with an ad-hoc MSW handler on the
  // harness's own server, ahead of the scenario's catch-all.
  it("never throws: a Decisions timeout degrades to the neutral fallback", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await gateway.use({ decisions: answering("ctx7") });
    gateway.server.use(
      http.post("*/v1/systemone", async () => {
        await delay(2_000);
        return HttpResponse.json({ answers: {} });
      }),
    );

    try {
      await expect(resolve()).resolves.toEqual({
        ...FALLBACK_CHAT_MODE_DECISION,
        requested: "auto",
      });
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("never throws: an unknown choice degrades to the neutral fallback", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await gateway.use({
      decisions: answeringRaw({
        answers: {
          [CHAT_MODE_ROUTING_QUESTION_KEY]: {
            type: "choice",
            choice: "banana",
            confidence: 1,
          },
        },
        model: "decision-default",
      }),
    });

    try {
      await expect(resolve()).resolves.toEqual({
        ...FALLBACK_CHAT_MODE_DECISION,
        requested: "auto",
      });
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("never throws: a malformed Decisions answer degrades to the neutral fallback", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await gateway.use({ decisions: answeringRaw({ answers: {} }) });

    try {
      await expect(resolve()).resolves.toEqual({
        ...FALLBACK_CHAT_MODE_DECISION,
        requested: "auto",
      });
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

const userMessage = (text: string): ChatbotMessage => ({
  id: `user-${text.length}`,
  role: "user",
  parts: [{ type: "text", text }],
});

describe("buildChatModeRouterInput", () => {
  it("uses the last user message and the previous turn as context", () => {
    const messages: ChatbotMessage[] = [
      userMessage("primera pregunta"),
      { id: "a-1", role: "assistant", parts: [{ type: "text", text: "primera respuesta" }] },
      userMessage("¿y eso cómo se hace?"),
    ];

    expect(buildChatModeRouterInput(messages)).toEqual({
      latestMessage: "¿y eso cómo se hace?",
      recentContext: "user: primera pregunta\nassistant: primera respuesta",
    });
  });

  it("truncates each context message to 500 characters", () => {
    const long = "x".repeat(600);
    const messages: ChatbotMessage[] = [
      userMessage(long),
      { id: "a-1", role: "assistant", parts: [{ type: "text", text: long }] },
      userMessage("final"),
    ];

    const result = buildChatModeRouterInput(messages);
    expect(result.recentContext.split("\n")[0]).toBe(`user: ${"x".repeat(500)}`);
    expect(result.recentContext.split("\n")[1]).toBe(`assistant: ${"x".repeat(500)}`);
  });

  it("returns an empty input when there is no user message", () => {
    expect(buildChatModeRouterInput([])).toEqual({
      latestMessage: "",
      recentContext: "",
    });
    expect(
      buildChatModeRouterInput([
        { id: "a-1", role: "assistant", parts: [{ type: "text", text: "hola" }] },
      ]),
    ).toEqual({ latestMessage: "", recentContext: "" });
  });

  it("ignores messages without text parts", () => {
    const messages: ChatbotMessage[] = [
      { id: "a-1", role: "assistant", parts: [{ type: "step-start" }] },
      userMessage("solo texto"),
    ];

    expect(buildChatModeRouterInput(messages)).toEqual({
      latestMessage: "solo texto",
      recentContext: "assistant: ",
    });
  });
});
