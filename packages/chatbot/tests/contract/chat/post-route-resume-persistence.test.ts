/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Exact-once persistence behind a client disconnect (ticket 02): the chat
 * POST route runs the REAL factory pipeline (inference kit, conversation
 * factory, persistence transaction over PGlite) while the response body is
 * cancelled mid-generation. The SSE tee registered in the resume registry
 * must keep the source alive so `onFinish` persists exactly one user + one
 * assistant message and confirms the entry as `persisted`. Legacy turns (no
 * or invalid `streamKey`) must still stream and persist with no registry
 * entry. Full-pipeline harness mirrors
 * `tests/integration/chat/mode-routing.test.ts`; the route handler is
 * imported and called directly (HTTP boundary, contract suite).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { setupTestDb } from "../../helpers/db-setup";
import { resetRegistry, parseSseFrames  } from "../../helpers/chat-resume";

// `vi.hoisted` so the `vi.mock` factory below can read it despite the hoist.
const { USER_ID } = vi.hoisted(() => ({
  USER_ID: "11111111-1111-1111-1111-111111111111",
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/features/auth/with-auth/handler", async () => {
  const { withAuthStub } = await import("../../helpers/chat-resume");
  return withAuthStub(USER_ID);
});

vi.mock("tracing", async () => {
  const { tracingStub } = await import("../../helpers/chat-resume");
  return tracingStub;
});

/**
 * Paced model: each chunk arrives ~40 ms apart, so cancelling the response
 * after a couple of frames lands reliably mid-generation while the tee'd
 * registry branch keeps draining the source.
 */
vi.mock("@/lib/infrastructure/ai/inference-kit", async () => {
  const { MockLanguageModelV3 } = await import("ai/test");
  const { ToolLoopAgent } = await import("ai");

  const pacedChunks: any[] = [
    { type: "text-start", id: "text-1" },
    ...["Palabra1 ", "Palabra2 ", "Palabra3 ", "Palabra4 ", "Palabra5 ", "Palabra6 "].map(
      (delta, i) => ({ type: "text-delta", id: "text-1", delta, index: i }),
    ),
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
  ];

  const model = new MockLanguageModelV3({
    modelId: "test-model",
    doStream: async () => {
      let index = 0;
      return {
        stream: new ReadableStream({
          async pull(controller) {
            if (index >= pacedChunks.length) {
              controller.close();
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 40));
            controller.enqueue(pacedChunks[index++]);
          },
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
  });

  const baseConfig = () => ({ model, company: "test" as const });
  return {
    inferenceKit: {
      languageModel: baseConfig,
      createAgentModel: baseConfig,
      decide: async () => {
        throw new Error("not routed in these tests");
      },
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

vi.mock("@/lib/features/chat/chat-modes/factory", async () => {
  const { streamText } = await import("ai");
  return {
    createChatModeAgent: vi.fn(async ({ ai }: any) => ({
      stream: ({ messages }: any) =>
        streamText({
          model: ai.getModelConfiguration().model,
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

import { POST } from "@/app/(chat)/api/chat/route";
import { get, getLatestByChat } from "@/lib/features/chat/resume/registry";
import {
  chat as chatTable,
  message as messageTable,
  user as userTable,
} from "@/lib/infrastructure/db/schema";

const ASSISTANT_TEXT = "Palabra1 Palabra2 Palabra3 Palabra4 Palabra5 Palabra6 ";

function makeRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request("http://test/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [
        { id: uuid(), role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      selectedModel: "basicChat",
      chatMode: "web",
      ...overrides,
    }),
  });
}

/** Polls `predicate` with real timers until true or the deadline expires. */
async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 5000, stepMs = 20 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("waitFor: deadline exceeded");
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

const assistantTextOf = (row: any): string =>
  (row.parts as any[])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

describe("POST /api/chat — exact-once persistence on disconnect", () => {
  let db: any;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  afterEach(async () => {
    await db.delete(messageTable);
    await db.delete(chatTable);
    await db.delete(userTable);
  });

  beforeEach(async () => {
    resetRegistry();
    await db.insert(userTable).values({ id: USER_ID, email: "resume@example.com" });
  });

  it("persists the turn exactly once when the client disconnects mid-stream", async () => {
    const streamKey = uuid();
    const res = await POST(makeRequest({ streamKey }) as never);
    expect(res.status).toBe(200);

    // Read a couple of SSE frames (start + first text delta) and then
    // simulate the screen going off: cancel the response body mid-stream.
    const reader = res.body!.getReader()!;
    const decoder = new TextDecoder();
    let received = "";
    while (parseSseFrames(received).length < 2) {
      const { done, value } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
    }
    expect(received).toContain("start");
    await reader.cancel();

    // The tee keeps generation and onFinish alive without any client reader:
    // the entry completes and the persistence confirms it.
    await waitFor(() => {
      const snapshot = get(streamKey);
      return !!snapshot && snapshot.complete && snapshot.state === "persisted";
    });

    // Exactly one chat (one title write) and exactly one user + one
    // assistant message: onFinish ran exactly once.
    const chats = await db.select().from(chatTable);
    expect(chats).toHaveLength(1);
    const rows = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.chatId, chats[0]!.id));
    expect(rows).toHaveLength(2);
    const userRow = rows.find((row: any) => row.role === "user");
    const assistantRow = rows.find((row: any) => row.role === "assistant");
    expect(userRow).toBeDefined();
    expect(assistantRow).toBeDefined();
    // The persisted assistant content is COMPLETE, not the partial the
    // client had when it disconnected.
    expect(assistantTextOf(assistantRow)).toBe(ASSISTANT_TEXT);

    // The registry entry is bound to the persisted chat and persisted.
    const snapshot = get(streamKey);
    expect(snapshot).toMatchObject({ state: "persisted", complete: true });
    expect(getLatestByChat(chats[0]!.id)).toEqual(snapshot);
  });

  it("a legacy turn without streamKey still streams and persists with no registry entry", async () => {
    const res = await POST(makeRequest() as never);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("data: [DONE]");

    const chats = await db.select().from(chatTable);
    expect(chats).toHaveLength(1);
    const rows = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.chatId, chats[0]!.id));
    expect(rows).toHaveLength(2);
    const assistantRow = rows.find((row: any) => row.role === "assistant");
    expect(assistantTextOf(assistantRow)).toBe(ASSISTANT_TEXT);

    // Nothing registered: neither the key nor the chat index has an entry.
    expect(getLatestByChat(chats[0]!.id)).toBeUndefined();
  });

  it("an invalid streamKey degrades to legacy behavior and registers nothing", async () => {
    const res = await POST(makeRequest({ streamKey: "not-a-uuid" }) as never);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("data: [DONE]");

    const chats = await db.select().from(chatTable);
    expect(chats).toHaveLength(1);
    const rows = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.chatId, chats[0]!.id));
    expect(rows).toHaveLength(2);

    expect(get("not-a-uuid")).toBeUndefined();
    expect(getLatestByChat(chats[0]!.id)).toBeUndefined();
  });
});
