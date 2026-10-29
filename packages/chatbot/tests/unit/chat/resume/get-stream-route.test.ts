import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HTTP-boundary tests for GET /api/chat/[key]/stream, imported directly
 * (prior art: tests/unit/agent-code/connect-route.test.ts).
 *
 * The real `withAuth` wrapper is exercised everywhere: `cached-auth`'s
 * `getSession` is the mocked seam, defaulting to a signed-in user and set to
 * `null` only in the 401 test.
 */
vi.mock("@/lib/features/auth/cached-auth", () => ({
  getSession: vi.fn(),
}));

import { resetRegistry } from "../../../helpers/chat-resume";
import { getSession } from "@/lib/features/auth/cached-auth";
import { GET } from "@/app/(chat)/api/chat/[key]/stream/route";
import {
  STREAM_TTL_MS,
  append,
  completeStream,
  register,
  setStartMessageId,
} from "@/lib/features/chat/resume/registry";

const mockedGetSession = vi.mocked(getSession);

function makeRequest(keyOrChatId: string, search = ""): Request {
  return new Request(`http://test/api/chat/${keyOrChatId}/stream${search}`);
}

function mockSignedIn(): void {
  mockedGetSession.mockResolvedValue({
    user: { id: "user-1", type: "regular" },
  } as never);
}

describe("GET /api/chat/[key]/stream", () => {
  beforeEach(() => {
    resetRegistry();
    mockSignedIn();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("replays the whole buffer byte-for-byte once the turn has completed", async () => {
    const frames = [
      'data: {"type":"start","messageId":"m-1"}\n\n',
      'data: {"type":"text-delta","id":"t-1","delta":"hel"}\n\n',
      'data: {"type":"text-delta","id":"t-1","delta":"lo"}\n\n',
      'data: {"type":"tool-input-available","toolCallId":"tool-1","toolName":"web_search","input":{"q":"hi"}}\n\n',
      'data: {"type":"finish"}\n\n',
      'data: {"type":"data-chat","chatId":"chat-1"}\n\n',
      'data: {"type":"data-usage","usage":{"totalTokens":42}}\n\n',
      "data: [DONE]\n\n",
    ];
    register("turn-1", { chatId: "chat-1" });
    for (const frame of frames) {
      append("turn-1", frame);
    }
    completeStream("turn-1");

    const res = await GET(makeRequest("turn-1"));

    expect(res.status).toBe(200);
    const body = await res.text();
    // Byte-for-byte: the replay reproduces the buffered frames exactly,
    // including the single tee-produced [DONE] terminator at the end.
    expect(body).toBe(frames.join(""));
    // The replay always starts from the original `start` chunk: that is what
    // makes the client-side rebuild idempotent.
    expect(body.startsWith(frames[0])).toBe(true);
  });

  it("replays the buffer and then delivers the live tail of an in-flight turn", async () => {
    register("turn-2", { chatId: "chat-2" });
    append("turn-2", 'data: {"type":"start","messageId":"m-2"}\n\n');
    append("turn-2", 'data: {"type":"text-delta","id":"t-2","delta":"par"}\n\n');

    const res = await GET(makeRequest("turn-2"));
    expect(res.status).toBe(200);

    // The turn keeps producing while the resume response is open.
    append("turn-2", 'data: {"type":"text-delta","id":"t-2","delta":"tial"}\n\n');
    append("turn-2", "data: [DONE]\n\n");
    completeStream("turn-2");

    expect(await res.text()).toBe(
      [
        'data: {"type":"start","messageId":"m-2"}\n\n',
        'data: {"type":"text-delta","id":"t-2","delta":"par"}\n\n',
        'data: {"type":"text-delta","id":"t-2","delta":"tial"}\n\n',
        "data: [DONE]\n\n",
      ].join(""),
    );
  });

  it("closes the stream right after the replay when the snapshot is already complete", async () => {
    register("turn-3");
    append("turn-3", 'data: {"type":"start","messageId":"m-3"}\n\n');
    append("turn-3", "data: [DONE]\n\n");
    completeStream("turn-3");

    const res = await GET(makeRequest("turn-3"));
    // Consuming to completion does not hang: the stream is already closed.
    expect(await res.text()).toBe(
      'data: {"type":"start","messageId":"m-3"}\n\n' + "data: [DONE]\n\n",
    );
  });

  it("answers 204 when ?after equals the entry's start message id (the client already holds it)", async () => {
    register("turn-after-1", { chatId: "chat-after-1" });
    setStartMessageId("turn-after-1", "m-start");
    append("turn-after-1", 'data: {"type":"start","messageId":"m-start"}\n\n');
    append("turn-after-1", 'data: {"type":"text-delta","id":"t","delta":"hi"}\n\n');
    completeStream("turn-after-1");

    const res = await GET(makeRequest("turn-after-1", "?after=m-start"));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("replays in full when ?after differs from the entry's start message id", async () => {
    register("turn-after-2");
    setStartMessageId("turn-after-2", "m-start");
    append("turn-after-2", 'data: {"type":"start","messageId":"m-start"}\n\n');
    append("turn-after-2", "data: [DONE]\n\n");
    completeStream("turn-after-2");

    const res = await GET(makeRequest("turn-after-2", "?after=some-other-message"));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      'data: {"type":"start","messageId":"m-start"}\n\n' + "data: [DONE]\n\n",
    );
  });

  it("replays in full when the ?after param is absent (unchanged behavior)", async () => {
    register("turn-after-3");
    setStartMessageId("turn-after-3", "m-start");
    append("turn-after-3", 'data: {"type":"start","messageId":"m-start"}\n\n');
    append("turn-after-3", "data: [DONE]\n\n");
    completeStream("turn-after-3");

    const res = await GET(makeRequest("turn-after-3"));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("m-start");
  });

  it("honours ?after through the chatId resolution path too", async () => {
    register("turn-after-4", { chatId: "chat-after-4" });
    setStartMessageId("turn-after-4", "m-start");
    append("turn-after-4", 'data: {"type":"start","messageId":"m-start"}\n\n');
    append("turn-after-4", "data: [DONE]\n\n");
    completeStream("turn-after-4");

    const hit = await GET(makeRequest("chat-after-4", "?after=m-start"));
    expect(hit.status).toBe(204);

    const miss = await GET(makeRequest("chat-after-4", "?after=m-other"));
    expect(miss.status).toBe(200);
  });

  it("answers 204 when there is no entry at all", async () => {
    const res = await GET(makeRequest("missing-key"));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("answers 204 when the TTL already evicted the entry", async () => {
    register("turn-4", { chatId: "chat-4" });
    append("turn-4", 'data: {"type":"start","messageId":"m-4"}\n\n');

    vi.advanceTimersByTime(STREAM_TTL_MS + 1);

    const res = await GET(makeRequest("turn-4"));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("answers 204 for a chatId whose latest stream has expired", async () => {
    register("turn-5", { chatId: "chat-5" });
    vi.advanceTimersByTime(STREAM_TTL_MS + 1);

    const res = await GET(makeRequest("chat-5"));
    expect(res.status).toBe(204);
  });

  it("requires auth: 401 without a session, before any registry access", async () => {
    mockedGetSession.mockResolvedValueOnce(null as never);

    const res = await GET(makeRequest("turn-6"));

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
  });

  it("resolves a chatId to the latest stream of that chat", async () => {
    register("turn-a", { chatId: "chat-7" });
    append("turn-a", 'data: {"type":"start","messageId":"m-a"}\n\n');
    register("turn-b", { chatId: "chat-7" });
    append("turn-b", 'data: {"type":"start","messageId":"m-b"}\n\n');
    append("turn-b", "data: [DONE]\n\n");
    completeStream("turn-b");

    const res = await GET(makeRequest("chat-7"));

    expect(res.status).toBe(200);
    // The index points at `turn-b`, the most recently registered stream.
    expect(await res.text()).toBe(
      'data: {"type":"start","messageId":"m-b"}\n\n' + "data: [DONE]\n\n",
    );
  });

  it("sends the SDK UI message stream headers", async () => {
    register("turn-8");
    append("turn-8", 'data: {"type":"start","messageId":"m-8"}\n\n');
    append("turn-8", "data: [DONE]\n\n");
    completeStream("turn-8");

    const res = await GET(makeRequest("turn-8"));

    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("stops writing after the client cancels the resume response", async () => {
    register("turn-9", { chatId: "chat-9" });
    append("turn-9", 'data: {"type":"start","messageId":"m-9"}\n\n');

    const res = await GET(makeRequest("turn-9"));
    await res.body?.cancel();

    // The client went away again mid-turn: later frames and the completion
    // must not throw (the generation itself keeps running server-side).
    expect(() => {
      append("turn-9", 'data: {"type":"text-delta","id":"t-9","delta":"x"}\n\n');
      append("turn-9", "data: [DONE]\n\n");
      completeStream("turn-9");
    }).not.toThrow();
  });
});
