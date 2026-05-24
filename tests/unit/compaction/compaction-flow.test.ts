import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CompactionDbPort, CompactionAiPort } from "@/lib/features/compaction/ports";
import type { ChatSummary, Message } from "@/lib/infrastructure/db/schema";

const MOCK_CHAT_ID = "test-chat-id";
const mockSummaryRecord: ChatSummary = {
  id: "summary-1",
  chatId: MOCK_CHAT_ID,
  messageId: "msg-15",
  summary: "test",
  tokensBefore: 100,
  modelUsed: "test-model",
  createdAt: new Date(),
};

const defaultSaveSummary: CompactionDbPort["saveSummary"] = () => async () => mockSummaryRecord;

function buildDbPort(overrides: Partial<CompactionDbPort> = {}): CompactionDbPort {
  return {
    getLatestSummary: vi.fn().mockResolvedValue(undefined),
    getMessagesByChatId: vi.fn().mockResolvedValue([] as Message[]),
    getMessageById: vi.fn().mockResolvedValue(undefined),
    saveSummary: defaultSaveSummary,
    transaction: vi.fn((fn) => fn({} as never)),
    ...overrides,
  };
}

function buildAiPort(overrides: Partial<CompactionAiPort> = {}): CompactionAiPort {
  return {
    generateText: vi.fn().mockResolvedValue("## Goal\nTest conversation\n## Key Facts\nIntegration test\n"),
    ...overrides,
  };
}

function buildMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i + 1}`,
    chatId: MOCK_CHAT_ID,
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    parts: [{ type: "text" as const, text: `Message ${i + 1} `.repeat(400) }],
    serial: i + 1,
    createdAt: new Date(),
    metadata: null,
  }));
}

vi.mock("server-only", () => ({}));

import { compact } from "@/lib/features/compaction/orchestration";

describe("compaction integration flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("compact saves a summary when messages exceed threshold", async () => {
    const messages = buildMessages(30);
    const saveSummaryFn = vi.fn<CompactionDbPort["saveSummary"]>(
      () => async () => mockSummaryRecord,
    );
    const generateTextFn = vi.fn<CompactionAiPort["generateText"]>().mockResolvedValue(
      "## Goal\nTest conversation\n## Key Facts\nIntegration test\n",
    );

    const db = buildDbPort({
      getMessagesByChatId: vi.fn().mockResolvedValue(messages),
      saveSummary: saveSummaryFn,
    });
    const ai = buildAiPort({ generateText: generateTextFn });

    await compact(db, ai, MOCK_CHAT_ID, {
      keepRecentTokens: 20000,
      reserveTokens: 16384,
      contextWindow: 40000,
      enabled: true,
    });

    expect(generateTextFn).toHaveBeenCalled();
    expect(saveSummaryFn).toHaveBeenCalled();
    const insertData = saveSummaryFn.mock.calls[0]![0];
    expect(insertData.chatId).toBe(MOCK_CHAT_ID);
    expect(insertData.summary).toBe(
      "## Goal\nTest conversation\n## Key Facts\nIntegration test\n",
    );
    expect(insertData.tokensBefore).toBeGreaterThan(0);
    expect(insertData.modelUsed).toBeTruthy();
    expect(insertData.messageId).toBeTruthy();
  });

  it("compact does nothing for empty chat", async () => {
    const saveSummaryFn = vi.fn<CompactionDbPort["saveSummary"]>(
      () => async () => mockSummaryRecord,
    );

    const db = buildDbPort({
      getMessagesByChatId: vi.fn().mockResolvedValue([] as Message[]),
      saveSummary: saveSummaryFn,
    });
    const ai = buildAiPort();

    await compact(db, ai, MOCK_CHAT_ID, {
      keepRecentTokens: 20000,
      reserveTokens: 16384,
      enabled: true,
    });

    expect(saveSummaryFn).not.toHaveBeenCalled();
  });

  it("compact respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const saveSummaryFn = vi.fn<CompactionDbPort["saveSummary"]>(
      () => async () => mockSummaryRecord,
    );

    const db = buildDbPort({
      getMessagesByChatId: vi.fn().mockResolvedValue(buildMessages(30)),
      saveSummary: saveSummaryFn,
    });
    const ai = buildAiPort();

    await compact(
      db,
      ai,
      MOCK_CHAT_ID,
      {
        keepRecentTokens: 20000,
        reserveTokens: 16384,
        enabled: true,
      },
      controller.signal,
    );

    expect(saveSummaryFn).not.toHaveBeenCalled();
  });
});
