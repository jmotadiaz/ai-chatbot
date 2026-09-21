import { describe, expect, it, vi } from "vitest";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import {
  buildChatModeRouterInput,
  createDeterministicChatModeRouter,
  FALLBACK_CHAT_MODE_DECISION,
  resolveChatMode,
} from "@/lib/features/chat/mode-routing";
import type {
  ChatModeRouterPort,
  RoutingDecision,
} from "@/lib/features/chat/mode-routing";

const input = { latestMessage: "¿Cómo uso drizzle-kit?", recentContext: "" };

const portReturning = (decision: RoutingDecision): ChatModeRouterPort => ({
  route: vi.fn(async () => decision),
});

const userMessage = (text: string): ChatbotMessage => ({
  id: `user-${text.length}`,
  role: "user",
  parts: [{ type: "text", text }],
});

describe("resolveChatMode", () => {
  it("passes a confident tool-backed decision through unchanged", async () => {
    const decision: RoutingDecision = {
      mode: "web",
      reason: "routed",
      confidence: 0.98,
      modelId: "typesafe/jev-1.13",
    };

    await expect(resolveChatMode(portReturning(decision), input)).resolves.toEqual({
      ...decision,
      requested: "auto",
    });
  });

  it("degrades below the confidence threshold to neutral", async () => {
    const port = portReturning({
      mode: "context7",
      reason: "routed",
      confidence: 0.42,
      modelId: "typesafe/jev-1.13",
    });

    await expect(resolveChatMode(port, input)).resolves.toMatchObject({
      requested: "auto",
      mode: "neutral",
      reason: "low_confidence",
      confidence: 0.42,
    });
  });

  it("keeps an explicit neutral decision as neither", async () => {
    const port = portReturning({
      mode: "neutral",
      reason: "neither",
      confidence: 0.9,
      modelId: "typesafe/jev-1.13",
    });

    await expect(resolveChatMode(port, input)).resolves.toMatchObject({
      mode: "neutral",
      reason: "neither",
    });
  });

  it("never throws: a failing router degrades to the neutral fallback", async () => {
    const port: ChatModeRouterPort = {
      route: vi.fn(async () => {
        throw new Error("router exploded");
      }),
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(resolveChatMode(port, input)).resolves.toEqual({
      ...FALLBACK_CHAT_MODE_DECISION,
      requested: "auto",
    });
    expect(consoleError).toHaveBeenCalled();
  });

  it("never throws: an invalid answer degrades to the neutral fallback", async () => {
    const port: ChatModeRouterPort = {
      route: vi.fn(async () => ({ mode: "banana", modelId: "x" }) as never),
    };

    await expect(resolveChatMode(port, input)).resolves.toEqual({
      ...FALLBACK_CHAT_MODE_DECISION,
      requested: "auto",
    });
  });

  it("drops provenance from an invalid answer", async () => {
    const port: ChatModeRouterPort = {
      route: vi.fn(
        async () =>
          ({ mode: "web", confidence: 0.99, probabilities: { web: 1 } }) as never,
      ),
    };

    await expect(resolveChatMode(port, input)).resolves.toEqual({
      ...FALLBACK_CHAT_MODE_DECISION,
      requested: "auto",
    });
  });
});

describe("deterministic test router", () => {
  it("routes marker-tagged messages and defaults to context7", async () => {
    const router = createDeterministicChatModeRouter();

    await expect(
      router.route({ latestMessage: "[[route:web]] precio del bitcoin", recentContext: "" }),
    ).resolves.toMatchObject({ mode: "web" });
    await expect(
      router.route({ latestMessage: "[[route:neutral]] hola", recentContext: "" }),
    ).resolves.toMatchObject({ mode: "neutral", reason: "neither" });
    await expect(
      router.route({ latestMessage: "¿Cómo uso drizzle?", recentContext: "" }),
    ).resolves.toMatchObject({ mode: "context7" });
  });
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
