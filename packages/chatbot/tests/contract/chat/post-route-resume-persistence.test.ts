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
 * `tests/unit/chat/mode-routing/persistence-and-routing.test.ts`; the route handler is
 * imported and called directly (HTTP boundary, contract suite).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { pacedTextReply } from "@ai-chatbot/model-gateway-testing";
import { setupTestDb } from "../../helpers/db-setup";
import { setupGatewayHarness } from "../../helpers/gateway-harness";
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

vi.mock("@/lib/features/chat/chat-modes/factory", async () => {
  const { streamText } = await import("ai");
  const { inferenceKit } = await import(
    "@/lib/infrastructure/ai/inference-kit"
  );
  return {
    createChatModeAgent: vi.fn(async ({ selection }: any) => ({
      stream: ({ messages }: any) =>
        streamText({
          // The turn's model comes from the composition the factory received:
          // the user-selected id resolved through the kit.
          model: inferenceKit.createAgentModel(selection.selectedModel).model,
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

const ASSISTANT_TEXT = "Word1 Word2 Word3 Word4 Word5 Word6 ";

/**
 * The catalog warm-up of `processChatResponse` and the generation are Gateway
 * HTTP calls: the scenario answers both, so this contract suite needs no server
 * listening on `:4001`. The reply is PACED (`pacedTextReply`), and the toolkit's
 * MSW transport streams it frame by frame instead of buffering the body, so the
 * disconnect can land mid-generation.
 */
const gateway = setupGatewayHarness();

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

/** Polls `predicate` (sync or async) with real timers until true or the deadline expires. */
async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  { timeoutMs = 5000, stepMs = 20 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
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
    // Paced chunks: cancelling the response body after a couple of frames lands
    // reliably mid-generation while the tee'd registry branch keeps draining.
    await gateway.use({
      chat: () =>
        pacedTextReply({
          chunks: ["Word1 ", "Word2 ", "Word3 ", "Word4 ", "Word5 ", "Word6 "],
          delayMs: 40,
        }),
    });
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

  it("an existing chat persists the turn's user message at turn start, not only in onFinish", async () => {
    const chatId = uuid();
    await db.insert(chatTable).values({ id: chatId, userId: USER_ID, title: "Existing" });
    const userMessage = {
      id: uuid(),
      role: "user",
      parts: [{ type: "text", text: "turn-start persistence" }],
    };

    const res = await POST(makeRequest({ chatId, messages: [userMessage] }) as never);
    expect(res.status).toBe(200);

    // WHILE the stream is still alive — the response body has not been
    // consumed, so `onFinish` cannot have run yet — the user row already
    // exists: turn-start persistence, not end-of-turn persistence.
    const userRowsWhileAlive = await db
      .select()
      .from(messageTable)
      .where(
        and(eq(messageTable.chatId, chatId), eq(messageTable.role, "user")),
      );
    expect(userRowsWhileAlive).toHaveLength(1);
    expect(userRowsWhileAlive[0]!.id).toBe(userMessage.id);

    // The turn completes normally: exactly one user + one assistant row.
    const text = await res.text();
    expect(text).toContain("data: [DONE]");
    // Quiesce: wait for `onFinish`'s own write to land before the afterEach
    // cleanup, so this test's late persistence cannot pollute later tests.
    await waitFor(async () => {
      const rows = await db
        .select()
        .from(messageTable)
        .where(eq(messageTable.chatId, chatId));
      return rows.length === 2;
    });
    const rows = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.chatId, chatId));
    expect(rows).toHaveLength(2);
    expect(rows.filter((row: any) => row.role === "user")).toHaveLength(1);
    expect(rows.filter((row: any) => row.role === "assistant")).toHaveLength(1);
  });

  it("an existing chat persists the turn's config (model, chat mode) at turn start, not only in onFinish", async () => {
    const chatId = uuid();
    // The chat's stored config is NOT the turn's config: the client changed
    // the model (and mode) for this turn.
    await db.insert(chatTable).values({
      id: chatId,
      userId: USER_ID,
      title: "Stale config",
      defaultModel: "basicChat",
      chatMode: "web",
    });
    const userMessage = {
      id: uuid(),
      role: "user",
      parts: [{ type: "text", text: "turn-start config persistence" }],
    };

    const res = await POST(
      makeRequest({
        chatId,
        messages: [userMessage],
        selectedModel: "slowStream",
        chatMode: "rag",
        temperature: 0.7,
      }) as never,
    );
    expect(res.status).toBe(200);

    // WHILE the stream is still alive — `onFinish` cannot have run yet — the
    // chat row already carries the TURN's config: a reopen mid-turn shows the
    // model/chat mode the in-flight turn is actually using.
    const [chatWhileAlive] = await db
      .select()
      .from(chatTable)
      .where(eq(chatTable.id, chatId));
    expect(chatWhileAlive).toBeDefined();
    expect(chatWhileAlive!.defaultModel).toBe("slowStream");
    expect(chatWhileAlive!.chatMode).toBe("rag");

    // The turn completes normally (quiesce before the afterEach cleanup).
    await res.text();
    await waitFor(async () => {
      const rows = await db
        .select()
        .from(messageTable)
        .where(eq(messageTable.chatId, chatId));
      return rows.length === 2;
    });
    // Exactly one chat row: the turn-start update did not create anything.
    const chats = await db.select().from(chatTable).where(eq(chatTable.id, chatId));
    expect(chats).toHaveLength(1);
  });

  it("a regenerate deletes the replaced assistant message at turn start", async () => {
    const chatId = uuid();
    const userMessage = {
      id: uuid(),
      role: "user",
      parts: [{ type: "text", text: "question" }],
    };
    const replacedAssistant = {
      id: uuid(),
      role: "assistant",
      parts: [{ type: "text", text: "old answer" }],
    };
    await db.insert(chatTable).values({ id: chatId, userId: USER_ID, title: "Regen" });
    await db
      .insert(messageTable)
      .values([
        { ...userMessage, chatId },
        { ...replacedAssistant, chatId },
      ]);

    // Regenerate shape: the SDK truncates the replaced assistant message
    // client-side, so the body's last message is the user message and
    // `messageId` is the id of the replaced assistant message.
    const res = await POST(
      makeRequest({ chatId, messageId: replacedAssistant.id, messages: [userMessage] }) as never,
    );
    expect(res.status).toBe(200);

    // WHILE the stream is still alive, the replaced assistant message is
    // already gone and the user message is present: a reopen mid-turn cannot
    // render the stale replaced turn anymore.
    const rowsWhileAlive = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.chatId, chatId));
    expect(rowsWhileAlive.find((row: any) => row.id === replacedAssistant.id)).toBeUndefined();
    expect(rowsWhileAlive.some((row: any) => row.role === "user")).toBe(true);

    // After completion: exactly one assistant row, and it is NOT the
    // replaced one.
    await res.text();
    await waitFor(async () => {
      const rows = await db
        .select()
        .from(messageTable)
        .where(eq(messageTable.chatId, chatId));
      const assistantRows = rows.filter((row: any) => row.role === "assistant");
      return assistantRows.length === 1 && assistantRows[0]!.id !== replacedAssistant.id;
    });
    const rows = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.chatId, chatId));
    const assistantRows = rows.filter((row: any) => row.role === "assistant");
    expect(assistantRows).toHaveLength(1);
    expect(assistantRows[0]!.id).not.toBe(replacedAssistant.id);
    expect(rows.filter((row: any) => row.role === "user")).toHaveLength(1);
  });

  it("a new chat (no persisted row) writes nothing at turn start", async () => {
    const draftChatId = uuid();
    const res = await POST(
      makeRequest({ chatId: draftChatId }) as never,
    );
    expect(res.status).toBe(200);

    // WHILE the stream is still alive, no Message row exists for the draft
    // chat: the chatId has no row (client-only draft), so nothing can be
    // written early. Scoped to the draft id — earlier tests' late `onFinish`
    // commits must not leak into this assertion.
    const rowsWhileAlive = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.chatId, draftChatId));
    expect(rowsWhileAlive).toHaveLength(0);

    // Today's behavior is unchanged: onFinish persists the chat + both
    // messages. Quiesce so the late persistence cannot pollute later tests.
    await res.text();
    await waitFor(async () => {
      const chats = await db
        .select()
        .from(chatTable)
        .where(eq(chatTable.id, draftChatId));
      if (chats.length !== 1) return false;
      const rows = await db
        .select()
        .from(messageTable)
        .where(eq(messageTable.chatId, draftChatId));
      return rows.length === 2;
    });
    const chats = await db
      .select()
      .from(chatTable)
      .where(eq(chatTable.id, draftChatId));
    expect(chats).toHaveLength(1);
    const rows = await db
      .select()
      .from(messageTable)
      .where(eq(messageTable.chatId, draftChatId));
    expect(rows).toHaveLength(2);
    expect(rows.filter((row: any) => row.role === "user")).toHaveLength(1);
    expect(rows.filter((row: any) => row.role === "assistant")).toHaveLength(1);
  });
});
