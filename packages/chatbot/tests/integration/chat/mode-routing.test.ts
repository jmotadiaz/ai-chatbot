/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Decision, DecideOptions } from "inference";
import { setupTestDb } from "../../helpers/db-setup";
import type { CompactionAiPort } from "@/lib/features/compaction/ports";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import type { ChatModeRouterPort } from "@/lib/features/chat/mode-routing/types";
import { createChatModeRouter } from "@/lib/features/chat/mode-routing/router";
import {
  chat as chatTable,
  message as messageTable,
  project as projectTable,
  user as userTable,
} from "@/lib/infrastructure/db/schema";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { dbMessageToChatbotMessage } from "@/lib/features/chat/utils";

vi.mock("server-only", () => ({}));

// The AI port is built inside `makeProcessChatResponse`, so the model comes
// from here instead of being injected. This mocks the composition root
// directly (the `foundation-model/server` shim it used to target is gone):
// everything under test resolves models through `inferenceKit.languageModel`.
vi.mock("@/lib/infrastructure/ai/inference-kit", async () => {
  const { MockLanguageModelV3 } = await import("ai/test");
  const { simulateReadableStream } = await import("ai");
  const model = new MockLanguageModelV3({
    modelId: "test-model",
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "Respuesta" },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            logprobs: undefined,
            usage: {
              inputTokens: {
                total: 3,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 3, text: undefined, reasoning: undefined },
            },
          },
        ],
      }),
      rawCall: { rawPrompt: null, rawSettings: {} },
    }),
  });
  return { inferenceKit: { languageModel: () => ({ model, company: "test" }) } };
});

// Real agent dispatch is irrelevant here; what matters is the metadata the
// factory attaches to the streamed assistant message.
vi.mock("@/lib/features/chat/chat-modes/factory", async () => {
  const { streamText } = await import("ai");
  return {
    createChatModeAgent: vi.fn(async ({ ai }: any) => ({
      stream: ({ messages }: any) =>
        streamText({
          model: ai.getContext7ModelConfiguration().model,
          messages,
        }),
    })),
  };
});

vi.mock("@/lib/features/chat/title", () => ({
  generateTitle: async () => "Auto chat",
}));

vi.mock("@/lib/features/memory/extraction", () => ({
  extractMemoryFacts: async () => [],
}));

const { makeProcessChatResponse } = await import(
  "@/lib/features/chat/conversation/factory"
);

const USER_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const USER_MESSAGE_ID = "33333333-3333-3333-3333-333333333333";

const compactionAi: CompactionAiPort = {
  generateText: vi.fn().mockResolvedValue("summary"),
};

/** Kit-generic fake `decide` answer: `createChatModeRouter` maps `choice: "ctx7"` to `mode: "context7"`. */
const routedFakeDecision: Decision = {
  choice: "ctx7",
  confidence: 0.93,
  probabilities: { ctx7: 0.93, web: 0.05, neither: 0.02 },
  modelId: "typesafe/jev-1.13-20260917",
  provider: "TypeSafe",
  latencyMs: 412,
  costUsd: 0.000017976,
};

/**
 * Builds a `ChatModeRouterPort` over the real `createChatModeRouter`
 * composition and a fake `decide`, so these tests exercise the actual
 * choice → mode/reason mapping (and probability filtering) instead of
 * hand-rolling a `RoutingDecision` fixture. `router.route` stays spy-able
 * (call count/args) by wrapping the composed port's method with `vi.fn`.
 */
const buildRouter = (
  decide: (options: DecideOptions) => Promise<Decision> = async () => routedFakeDecision,
): ChatModeRouterPort => {
  const port = createChatModeRouter(decide);
  return { route: vi.fn(port.route) };
};

const userMessage = (text: string): ChatbotMessage => ({
  id: USER_MESSAGE_ID,
  role: "user",
  parts: [{ type: "text", text }],
});

const consume = async (stream: ReadableStream) => {
  const reader = stream.getReader();
  while (!(await reader.read()).done) {
    // drain
  }
};

const runTurn = async ({
  router,
  chatMode,
  projectId,
  text = "¿Cómo uso drizzle-kit?",
}: {
  router: ChatModeRouterPort;
  chatMode: string;
  projectId?: string;
  text?: string;
}) => {
  const processChatResponse = makeProcessChatResponse(compactionAi, router);
  const stream = await processChatResponse({
    messages: [userMessage(text)],
    selectedModel: chatModelKeys[0],
    chatMode: chatMode as never,
    projectId,
    user: { id: USER_ID },
  });

  await consume(stream);
};

describe("auto chat mode persistence", () => {
  let db: any;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  afterEach(async () => {
    await db.delete(messageTable);
    await db.delete(chatTable);
    await db.delete(projectTable);
    await db.delete(userTable);
  });

  const seedUser = async () => {
    await db.insert(userTable).values({ id: USER_ID, email: "auto@example.com" });
  };

  it("persists Chat.chatMode = auto and chatModeRouting on the assistant message", async () => {
    await seedUser();
    const router = buildRouter();

    await runTurn({ router, chatMode: "auto" });

    expect(router.route).toHaveBeenCalledTimes(1);
    expect(router.route).toHaveBeenCalledWith({
      latestMessage: "¿Cómo uso drizzle-kit?",
      recentContext: "",
    });

    const [chatRow] = await db
      .select()
      .from(chatTable)
      .where(eq(chatTable.userId, USER_ID));
    expect(chatRow.chatMode).toBe("auto");

    const rows = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.chatId, chatRow.id));
    const assistantRow = rows.find((row: any) => row.role === "assistant");
    expect(assistantRow).toBeDefined();
    expect(assistantRow.metadata.chatModeRouting).toEqual({
      requested: "auto",
      mode: "context7",
      reason: "routed",
      confidence: 0.93,
      probabilities: { ctx7: 0.93, web: 0.05, neither: 0.02 },
      modelId: "typesafe/jev-1.13-20260917",
      provider: "TypeSafe",
      latencyMs: 412,
      costUsd: 0.000017976,
    });

    // Round-trip through the read path used when a chat is reloaded.
    const [reloaded] = dbMessageToChatbotMessage([assistantRow]);
    expect(reloaded.metadata?.chatModeRouting).toEqual({
      requested: "auto",
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

  it("does not route explicit chat modes and keeps the stored mode", async () => {
    await seedUser();
    const router = buildRouter();

    await runTurn({ router, chatMode: "web" });

    expect(router.route).not.toHaveBeenCalled();

    const [chatRow] = await db
      .select()
      .from(chatTable)
      .where(eq(chatTable.userId, USER_ID));
    expect(chatRow.chatMode).toBe("web");

    const rows = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.chatId, chatRow.id));
    const assistantRow = rows.find((row: any) => row.role === "assistant");
    expect(assistantRow.metadata.chatModeRouting).toBeUndefined();
  });

  it("does not route project chats even in auto", async () => {
    await seedUser();
    await db.insert(projectTable).values({
      id: PROJECT_ID,
      userId: USER_ID,
      name: "Project",
      systemPrompt: "Project prompt",
    });
    const router = buildRouter();

    await runTurn({ router, chatMode: "auto", projectId: PROJECT_ID });

    expect(router.route).not.toHaveBeenCalled();

    const [chatRow] = await db
      .select()
      .from(chatTable)
      .where(eq(chatTable.userId, USER_ID));
    expect(chatRow.projectId).toBe(PROJECT_ID);

    const rows = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.chatId, chatRow.id));
    const assistantRow = rows.find((row: any) => row.role === "assistant");
    expect(assistantRow.metadata.chatModeRouting).toBeUndefined();
  });

  it("degrades to the neutral fallback and still persists when decide fails", async () => {
    await seedUser();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = buildRouter(async () => {
      throw new Error("decide exploded");
    });

    try {
      await runTurn({ router, chatMode: "auto" });
    } finally {
      consoleError.mockRestore();
    }

    const [chatRow] = await db
      .select()
      .from(chatTable)
      .where(eq(chatTable.userId, USER_ID));
    const rows = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.chatId, chatRow.id));
    const assistantRow = rows.find((row: any) => row.role === "assistant");
    expect(assistantRow.metadata.chatModeRouting).toEqual({
      requested: "auto",
      mode: "neutral",
      reason: "fallback",
      modelId: "unavailable",
    });
  });
});
