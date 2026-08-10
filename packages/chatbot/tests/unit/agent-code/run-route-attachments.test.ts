import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/features/auth/with-auth/handler", () => ({
  withAuth:
    <T>(handler: T) =>
    async (req: Request) =>
      (handler as never as (user: { id: string }, req: Request) => Promise<Response>)(
        { id: "user-1" },
        req,
      ),
}));

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  FileTraceSink: class {
    async open() {}
    async close() {}
  },
  runWithTraceContext: <T>(_ctx: unknown, fn: () => Promise<T>) => fn(),
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const mockState: {
  dbSession: { piSessionId: string | null; project: string; label?: string | null };
  labelCalls: unknown[];
  sendPromptParams: unknown[];
} = vi.hoisted(() => ({
  dbSession: { piSessionId: "stub-pi-session", project: "p", label: null },
  labelCalls: [],
  sendPromptParams: [],
}));

vi.mock("@/lib/features/code/session-store", () => ({
  getSession: vi.fn(() => Promise.resolve(mockState.dbSession)),
  touchSession: vi.fn().mockResolvedValue(undefined),
  updatePiSessionId: vi.fn().mockResolvedValue(undefined),
  updateSessionLabel: vi.fn((params: unknown) => {
    mockState.labelCalls.push(params);
    return Promise.resolve(undefined);
  }),
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async initializeSession() {
      return { sessionId: "s", piSessionId: "stub-pi-session" };
    }
    async sendPrompt(params: unknown) {
      mockState.sendPromptParams.push(params);
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    }
  },
}));

import { POST } from "@/app/(chat)/api/agent/code/route";
import {
  promptTextFromContent,
  stripNonTailAttachmentData,
  type RequestMessage,
} from "@/lib/features/code/run-request-messages";

function makeRequest(messages: RequestMessage[]) {
  return new Request("http://test/api/agent/code", {
    method: "POST",
    body: JSON.stringify({
      threadId: "t1",
      runId: "run-1",
      context: [
        { description: "project", value: "p" },
        { description: "sessionId", value: "s" },
        { description: "modelId", value: "Deepseek v4 Pro" },
      ],
      messages,
    }),
  });
}

beforeEach(() => {
  mockState.dbSession = { piSessionId: "stub-pi-session", project: "p", label: null };
  mockState.labelCalls = [];
  mockState.sendPromptParams = [];
});

describe("promptTextFromContent", () => {
  it("passes string content through unchanged", () => {
    expect(promptTextFromContent("hello")).toBe("hello");
  });

  it("joins the text parts of an InputContent[] array", () => {
    expect(
      promptTextFromContent([
        { type: "text", text: "look at this" },
        { type: "image", source: { type: "data", value: "x", mimeType: "image/png" } },
      ]),
    ).toBe("look at this");
  });

  it("returns an empty string for undefined content", () => {
    expect(promptTextFromContent(undefined)).toBe("");
  });
});

describe("stripNonTailAttachmentData", () => {
  it("blanks out data-source values on every message except the last", () => {
    const messages: RequestMessage[] = [
      {
        id: "u1",
        role: "user",
        content: [
          { type: "text", text: "first" },
          { type: "image", source: { type: "data", value: "old-payload", mimeType: "image/png" } },
        ],
      },
      { id: "a1", role: "assistant", content: "reply" },
      {
        id: "u2",
        role: "user",
        content: [
          { type: "text", text: "second" },
          { type: "image", source: { type: "data", value: "tail-payload", mimeType: "image/png" } },
        ],
      },
    ];

    const stripped = stripNonTailAttachmentData(messages);

    const firstImage = (stripped[0]!.content as Array<Record<string, unknown>>)[1]!
      .source as Record<string, unknown>;
    expect(firstImage.value).toBe("");
    expect(firstImage.mimeType).toBe("image/png");

    const tailImage = (stripped[2]!.content as Array<Record<string, unknown>>)[1]!
      .source as Record<string, unknown>;
    expect(tailImage.value).toBe("tail-payload");
  });

  it("leaves string-content messages and the empty-array case untouched", () => {
    expect(stripNonTailAttachmentData([])).toEqual([]);
    const messages: RequestMessage[] = [{ id: "u1", role: "user", content: "hello" }];
    expect(stripNonTailAttachmentData(messages)).toEqual(messages);
  });
});

describe("POST /api/agent/code with attachments", () => {
  it("extracts the prompt text and forwards the tail message's structured content to the worker", async () => {
    const messages: RequestMessage[] = [
      {
        id: "u1",
        role: "user",
        content: [
          { type: "text", text: "look at this" },
          {
            type: "image",
            source: { type: "data", value: "aW1hZ2U=", mimeType: "image/png" },
          },
        ],
      },
    ];

    const res = await POST(makeRequest(messages) as never);
    expect(res.status).toBe(200);
    await res.text();

    expect(mockState.sendPromptParams).toHaveLength(1);
    const params = mockState.sendPromptParams[0] as { prompt: string; messages: RequestMessage[] };
    expect(params.prompt).toBe("look at this");
    expect(params.messages[0]!.content).toEqual(messages[0]!.content);
  });

  it("derives the session label from an attachment-first first message", async () => {
    const messages: RequestMessage[] = [
      {
        id: "u1",
        role: "user",
        content: [
          { type: "text", text: "please review this file\nsecond line" },
          { type: "document", source: { type: "data", value: "eA==", mimeType: "text/plain" } },
        ],
      },
    ];

    const res = await POST(makeRequest(messages) as never);
    await res.text();

    expect(mockState.labelCalls).toEqual([
      { userId: "user-1", sessionId: "s", label: "please review this file" },
    ]);
  });

  it("does not set a label when the first user message has no typed text (image-only)", async () => {
    const messages: RequestMessage[] = [
      {
        id: "u1",
        role: "user",
        content: [
          { type: "image", source: { type: "data", value: "aW1hZ2U=", mimeType: "image/png" } },
        ],
      },
    ];

    const res = await POST(makeRequest(messages) as never);
    await res.text();

    expect(mockState.labelCalls).toEqual([]);
  });
});
