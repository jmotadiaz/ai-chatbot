/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * HTTP boundary of the chat POST route feeding the resume registry
 * (ticket 02). The route handler is imported and called directly with a
 * `Request` — same in-process recipe as
 * `tests/unit/agent-code/connect-route.test.ts` — with `processChatResponse`
 * stubbed to a deterministic UI-message stream so the SSE tee is observable
 * through the registry's public API only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { simulateReadableStream } from "ai";
import { v4 as uuid } from "uuid";

vi.mock("@/lib/features/auth/with-auth/handler", async () => {
  const { withAuthStub } = await import("../../helpers/chat-resume");
  return withAuthStub("user-1");
});

vi.mock("tracing", async () => {
  const { tracingStub } = await import("../../helpers/chat-resume");
  return tracingStub;
});

const processChatResponseMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/features/chat/handlers", () => ({
  processChatResponse: processChatResponseMock,
}));

import { parseSseFrames } from "../../helpers/chat-resume";
import { POST } from "@/app/(chat)/api/chat/route";
import { get, getLatestByChat } from "@/lib/features/chat/resume/registry";

/** Deterministic stub stream: the frames the tee must capture, in order. */
const stubChunks: any[] = [
  { type: "start", messageId: "assistant-1" },
  { type: "text-start", id: "text-1" },
  { type: "text-delta", id: "text-1", delta: "Hello" },
  { type: "text-end", id: "text-1" },
  { type: "finish" },
  { type: "data-usage", data: { inputTokens: 1, outputTokens: 2 } },
  { type: "data-chat", data: { id: "chat-1" } },
];

function makeRequest(overrides: Record<string, unknown> = {}): Request {
  // A fresh chatId per call: the registry is module-level, so each test must
  // exercise its own "latest stream per chat" index slot.
  const chatId = (overrides.chatId as string | undefined) ?? uuid();
  return new Request("http://test/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [
        { id: uuid(), role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
      selectedModel: "basicChat",
      chatMode: "web",
      chatId,
      ...overrides,
    }),
  });
}

beforeEach(() => {
  processChatResponseMock.mockImplementation(async () =>
    simulateReadableStream({ chunks: stubChunks }),
  );
});

describe("POST /api/chat — resume registry feed", () => {
  it("tees every SSE frame into the registry in order, start first and [DONE] last", async () => {
    const streamKey = uuid();
    const chatId = uuid();
    const res = await POST(makeRequest({ streamKey, chatId }) as never);
    expect(res.status).toBe(200);

    // The client branch still streams the turn normally.
    const clientFrames = parseSseFrames(await res.text());
    expect(JSON.parse(clientFrames[0]!.slice("data: ".length))).toEqual({
      type: "start",
      messageId: "assistant-1",
    });

    // The streamKey reached the handler and the entry was registered before
    // the response was built.
    expect(processChatResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({ streamKey }),
    );

    const snapshot = get(streamKey);
    expect(snapshot).toBeDefined();
    expect(snapshot!.complete).toBe(true);

    const frames = snapshot!.chunks;
    // The tee copy ends with the JsonToSseTransformStream flush terminator.
    expect(frames.at(-1)).toBe("data: [DONE]\n\n");

    const parts = frames
      .slice(0, -1)
      .map((frame) => JSON.parse(frame.replace(/^data: /, "")) as any);
    expect(parts.map((part) => part.type)).toEqual([
      "start",
      "text-start",
      "text-delta",
      "text-end",
      "finish",
      "data-usage",
      "data-chat",
    ]);
    // The first frame is the original `start` chunk with the original
    // messageId — the replay idempotency anchor.
    expect(parts[0]).toEqual({ type: "start", messageId: "assistant-1" });
    expect(parts[parts.length - 1]).toEqual({
      type: "data-chat",
      data: { id: "chat-1" },
    });

    // The "latest stream per chat" index points at this turn.
    expect(getLatestByChat(chatId)).toEqual(snapshot);
  });

  it("does not register a preventChatPersistence turn, even with a valid streamKey", async () => {
    const streamKey = uuid();
    const chatId = uuid();
    const res = await POST(
      makeRequest({ streamKey, chatId, preventChatPersistence: true }) as never,
    );
    expect(res.status).toBe(200);
    expect(parseSseFrames(await res.text())).toHaveLength(
      stubChunks.length + 1, // + the [DONE] terminator
    );

    // No registration, no tee, no index entry: zero registry memory.
    expect(processChatResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({ streamKey: undefined }),
    );
    expect(get(streamKey)).toBeUndefined();
    expect(getLatestByChat(chatId)).toBeUndefined();
  });

  it("degrades to today's behavior on an invalid streamKey without breaking the turn", async () => {
    const chatId = uuid();
    const res = await POST(
      makeRequest({ streamKey: "not-a-uuid", chatId }) as never,
    );
    expect(res.status).toBe(200);
    expect(parseSseFrames(await res.text())).toHaveLength(
      stubChunks.length + 1,
    );

    expect(processChatResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({ streamKey: undefined }),
    );
    expect(get("not-a-uuid")).toBeUndefined();
    expect(getLatestByChat(chatId)).toBeUndefined();
  });
});
