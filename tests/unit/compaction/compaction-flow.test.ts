import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InsertChatSummary } from "@/lib/infrastructure/db/schema";
import type { ChatbotMessage } from "@/lib/features/chat/types";

const MOCK_CHAT_ID = "test-chat-id";

interface InsertChatSnapshot {
  chatId: string;
  messageId: string;
  summary: string;
  tokensBefore: number;
  modelUsed: string;
}

const testState = vi.hoisted(() => {
  let capturedInsertData: InsertChatSnapshot | null = null;

  const messages = Array.from({ length: 30 }, (_, i) => ({
    id: `msg-${i + 1}`,
    chatId: "test-chat-id",
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    parts: [{ type: "text" as const, text: `Message ${i + 1} `.repeat(400) }],
    serial: i + 1,
    createdAt: new Date(),
    metadata: null,
  }));

  const orderByMock = vi.fn().mockResolvedValue(messages);

  return {
    messages,
    orderByMock,
    get capturedInsertData() {
      return capturedInsertData;
    },
    set capturedInsertData(v: InsertChatSnapshot | null) {
      capturedInsertData = v;
    },
  };
});

vi.mock("@/lib/infrastructure/db/db", () => {
  const orderByMock = testState.orderByMock;
  const messages = testState.messages;

  const summaryRecord = {
    id: "summary-1",
    chatId: "test-chat-id",
    messageId: messages[14].id,
    summary: "## Goal\nTest conversation\n## Key Facts\nIntegration test\n",
    tokensBefore: 15000,
    modelUsed: "Deepseek v4 Flash",
    createdAt: new Date(),
  };

  const mockTx = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([summaryRecord]),
  };

  const whereResult = { orderBy: orderByMock };
  const whereFn = vi.fn().mockReturnValue(whereResult);
  const fromResult = { where: whereFn };
  const fromFn = vi.fn().mockReturnValue(fromResult);

  return {
    getDb: vi.fn(() => ({
      select: vi.fn(() => ({ from: fromFn })),
      transaction: vi.fn((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
    })),
  };
});

vi.mock("@/lib/features/compaction/repository", () => {
  const summaryRecord = {
    id: "summary-1",
    chatId: "test-chat-id",
    messageId: "msg-15",
    summary: "## Goal\nTest conversation\n## Key Facts\nIntegration test\n",
    tokensBefore: 15000,
    modelUsed: "Deepseek v4 Flash",
    createdAt: new Date(),
  };

  return {
    getLatestSummary: vi.fn().mockResolvedValue(undefined),
    saveSummary: (data: InsertChatSummary) => {
      testState.capturedInsertData = {
        chatId: data.chatId,
        messageId: data.messageId,
        summary: data.summary,
        tokensBefore: data.tokensBefore,
        modelUsed: data.modelUsed,
      };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return async (_tx: unknown) => summaryRecord;
    },
    getSummaryById: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi
      .fn()
      .mockResolvedValue({
        text: "## Goal\nTest conversation\n## Key Facts\nIntegration test\n",
      }),
    pruneMessages: vi.fn(({ messages }: { messages: unknown[] }) => messages),
    convertToModelMessages: vi.fn((messages: ChatbotMessage[]) =>
      Promise.resolve(
        messages.map((m) => ({
          role: m.role,
          content: [
            {
              type: "text" as const,
              text: m.parts
                .filter((p) => p.type === "text")
                .map((p) => (p as { text: string }).text)
                .join(" "),
            },
          ],
        })),
      ),
    ),
  };
});

import { compact } from "@/lib/features/compaction/orchestration";

describe("compaction integration flow", () => {
  beforeEach(() => {
    testState.capturedInsertData = null;
    vi.clearAllMocks();
  });

  it("compact saves a summary when messages exceed threshold", async () => {
    await compact(MOCK_CHAT_ID, {
      keepRecentTokens: 20000,
      reserveTokens: 16384,
      contextWindow: 40000,
      enabled: true,
    });

    expect(testState.capturedInsertData).not.toBeNull();
    expect(testState.capturedInsertData!.chatId).toBe(MOCK_CHAT_ID);
    expect(testState.capturedInsertData!.summary).toBe(
      "## Goal\nTest conversation\n## Key Facts\nIntegration test\n",
    );
    expect(testState.capturedInsertData!.tokensBefore).toBeGreaterThan(0);
    expect(testState.capturedInsertData!.modelUsed).toBeTruthy();
    expect(testState.capturedInsertData!.messageId).toBeTruthy();
  });

  it("compact does nothing for empty chat", async () => {
    testState.orderByMock.mockResolvedValueOnce([]);

    await compact(MOCK_CHAT_ID, {
      keepRecentTokens: 20000,
      reserveTokens: 16384,
      enabled: true,
    });

    expect(testState.capturedInsertData).toBeNull();
  });

  it("compact respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    await compact(
      MOCK_CHAT_ID,
      {
        keepRecentTokens: 20000,
        reserveTokens: 16384,
        enabled: true,
      },
      controller.signal,
    );

    expect(testState.capturedInsertData).toBeNull();
  });
});
