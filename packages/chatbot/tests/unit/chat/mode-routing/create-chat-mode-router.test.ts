import { describe, expect, it, vi } from "vitest";
import type { Decision, DecideOptions } from "inference";
import { createChatModeRouter } from "@/lib/features/chat/mode-routing/router";
import { CHAT_MODE_ROUTING_QUESTION } from "@/lib/features/chat/mode-routing/questions";

const baseDecision: Decision = {
  choice: "ctx7",
  confidence: 0.93,
  probabilities: { ctx7: 0.93, web: 0.05, neither: 0.02 },
  modelId: "typesafe/jev-1.13-20260917",
  provider: "TypeSafe",
  latencyMs: 412,
  costUsd: 0.000017976,
};

const input = { latestMessage: "¿Cómo uso drizzle-kit?", recentContext: "user: hola" };

describe("createChatModeRouter: choice -> mode/reason mapping over a fake decide", () => {
  it("maps ctx7 to context7/routed and copies the rest of the provenance", async () => {
    const decide = vi.fn(async () => baseDecision);
    const router = createChatModeRouter(decide);

    await expect(router.route(input)).resolves.toEqual({
      mode: "context7",
      reason: "routed",
      confidence: 0.93,
      probabilities: { ctx7: 0.93, web: 0.05, neither: 0.02 },
      modelId: "typesafe/jev-1.13-20260917",
      provider: "TypeSafe",
      latencyMs: 412,
      costUsd: 0.000017976,
    });
  });

  it("maps web to web/routed", async () => {
    const router = createChatModeRouter(async () => ({ ...baseDecision, choice: "web" }));

    await expect(router.route(input)).resolves.toMatchObject({
      mode: "web",
      reason: "routed",
    });
  });

  it("maps neither to neutral/neither", async () => {
    const router = createChatModeRouter(async () => ({ ...baseDecision, choice: "neither" }));

    await expect(router.route(input)).resolves.toMatchObject({
      mode: "neutral",
      reason: "neither",
    });
  });

  it("drops probability keys outside the question's own options", async () => {
    const router = createChatModeRouter(async () => ({
      ...baseDecision,
      probabilities: { ctx7: 0.9, web: 0.1, neither: 0, banana: 0.5 },
    }));

    const decision = await router.route(input);
    expect(decision.probabilities).toEqual({ ctx7: 0.9, web: 0.1, neither: 0 });
  });

  it("omits probabilities entirely when none of the question's options are present", async () => {
    const router = createChatModeRouter(async () => ({
      ...baseDecision,
      probabilities: { banana: 0.5 },
    }));

    const decision = await router.route(input);
    expect(decision.probabilities).toBeUndefined();
  });

  it("asks the Chat Mode Routing question by Model Role, with the input as state", async () => {
    const decide = vi.fn(async () => baseDecision);
    const router = createChatModeRouter(decide);

    await router.route(input);

    expect(decide).toHaveBeenCalledWith({
      model: "chatModeRouter",
      question: CHAT_MODE_ROUTING_QUESTION,
      state: {
        latest_message: input.latestMessage,
        recent_context: input.recentContext,
      },
    } satisfies DecideOptions);
  });

  it("rejects an unknown choice instead of guessing a mode", async () => {
    const router = createChatModeRouter(async () => ({ ...baseDecision, choice: "banana" }));

    await expect(router.route(input)).rejects.toThrow(/Unknown chat mode option/);
  });

  it("propagates a decide failure (fallback policy is the consumer's)", async () => {
    const router = createChatModeRouter(async () => {
      throw new Error("decide exploded");
    });

    await expect(router.route(input)).rejects.toThrow("decide exploded");
  });
});
