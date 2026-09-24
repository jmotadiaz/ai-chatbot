/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import type { CompactionAiPort } from "@/lib/features/compaction/ports";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import type {
  ChatModeRouterPort,
  RoutingDecision,
} from "@/lib/features/chat/mode-routing/types";
import { chatModelKeys } from "@/lib/features/foundation-model/config";

/** Arbitrary provenance value: these tests fake the port directly, never a real Decisions call. */
const TEST_ROUTING_MODEL_ID = "test/routing-model";

vi.mock("server-only", () => ({}));

// `vi.hoisted` so the mock factory below can share the recorded calls with the
// test body (the factory runs before the dynamic import of the conversation
// factory, which is what lets the AI port be built from this mock model).
const state = vi.hoisted(() => ({
  calls: [] as LanguageModelV3CallOptions[],
}));

// The AI port is built inside `makeProcessChatResponse`, so the user-selected
// model + parameters reach the neutral branch from here. This mocks the
// composition root directly (the `foundation-model/server` shim it used to
// target is gone): everything under test resolves models through
// `inferenceKit.languageModel`.
vi.mock("@/lib/infrastructure/ai/inference-kit", async () => {
  const { MockLanguageModelV3 } = await import("ai/test");
  const { simulateReadableStream } = await import("ai");
  const { textChunks, finishChunk } = await import("inference/testing");

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

  return {
    inferenceKit: {
      languageModel: () => ({
        model,
        company: "openai",
        temperature: 0.2,
        topP: 0.8,
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

const USER_ID = "11111111-1111-1111-1111-111111111111";

const compactionAi: CompactionAiPort = {
  generateText: vi.fn().mockResolvedValue("summary"),
};

const userMessage = (text: string): ChatbotMessage => ({
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text }],
});

const portReturning = (decision: RoutingDecision): ChatModeRouterPort => ({
  route: vi.fn(async () => decision),
});

const buildRouter = (route: ChatModeRouterPort["route"]): ChatModeRouterPort => ({
  route,
});

const runTurn = async ({
  router,
  temperature,
}: {
  router: ChatModeRouterPort;
  temperature?: number;
}) => {
  const processChatResponse = makeProcessChatResponse(compactionAi, router);
  const stream = await processChatResponse({
    messages: [userMessage("hola, cuéntame algo")],
    selectedModel: chatModelKeys[0],
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
    const router = portReturning({
      mode: "neutral",
      reason: "neither",
      confidence: 0.91,
      modelId: TEST_ROUTING_MODEL_ID,
    });

    const { chunkTypes, text, routing } = await runTurn({
      router,
      temperature: 0.42,
    });

    expect(router.route).toHaveBeenCalledTimes(1);
    expect(chunkTypes.filter((type) => type.startsWith("tool-"))).toEqual([]);
    expect(text).toBe("Respuesta neutra");
    expect(routing).toMatchObject({
      requested: "auto",
      mode: "neutral",
      reason: "neither",
      confidence: 0.91,
      modelId: TEST_ROUTING_MODEL_ID,
    });

    // The model was never offered a tool, and kept the user's parameters.
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]!.tools ?? []).toEqual([]);
    expect(state.calls[0]!.temperature).toBe(0.42);
    expect(state.calls[0]!.topP).toBe(0.8);
  });

  it.each([
    {
      name: "a router error",
      route: async () => {
        throw new Error("router exploded");
      },
    },
    {
      name: "a router timeout",
      route: async () => {
        throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      },
    },
    {
      name: "an invalid decision",
      route: async () => ({ mode: "banana", modelId: "x" }) as any,
    },
  ])("degrades to the neutral fallback when routing fails: $name", async ({ route }) => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const { chunkTypes, text, routing } = await runTurn({
        router: buildRouter(vi.fn(route)),
      });

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
  });

  it("applies a low-confidence classifier decision as-is (no gate)", async () => {
    const router = portReturning({
      mode: "web",
      reason: "routed",
      confidence: 0.42,
      modelId: TEST_ROUTING_MODEL_ID,
    });

    const { routing, text } = await runTurn({ router });

    expect(routing).toMatchObject({
      requested: "auto",
      mode: "web",
      reason: "routed",
      confidence: 0.42,
    });
    expect(text).toBe("Respuesta neutra");
  });

  it("routes a valid answer without confidence instead of gating it", async () => {
    const router = portReturning({
      mode: "web",
      reason: "routed",
      modelId: TEST_ROUTING_MODEL_ID,
    });

    const { routing, text } = await runTurn({ router });

    expect(routing).toMatchObject({
      requested: "auto",
      mode: "web",
      reason: "routed",
    });
    expect(text).toBe("Respuesta neutra");
  });
});
