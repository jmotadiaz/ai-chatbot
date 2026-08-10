/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb } from "../../helpers/db-setup";
import type { CompactionAiPort } from "@/lib/features/compaction/ports";
import {
  chat as chatTable,
  message as messageTable,
  chatSummary as chatSummaryTable,
  user as userTable,
  project as projectTable,
} from "@/lib/infrastructure/db/schema";
import { compact } from "@/lib/features/compaction/orchestration";

const MOCK_USER_ID = "11111111-1111-1111-1111-111111111111";
const MOCK_PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const MOCK_CHAT_ID = "33333333-3333-3333-3333-333333333333";

function buildAiPort(overrides: Partial<CompactionAiPort> = {}): CompactionAiPort {
  return {
    generateText: vi.fn().mockResolvedValue("## Goal\nTest conversation\n## Key Facts\nIntegration test\n"),
    ...overrides,
  };
}

function buildMessageValues(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `44444444-4444-4444-4444-${(i + 1).toString().padStart(12, "0")}`,
    chatId: MOCK_CHAT_ID,
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    parts: [{ type: "text" as const, text: `Message ${i + 1} `.repeat(400) }],
    serial: i + 1,
    createdAt: new Date(),
    metadata: null,
  }));
}

vi.mock("server-only", () => ({}));

describe("compaction integration flow", () => {
  let db: any;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clear tables
    await db.delete(chatSummaryTable);
    await db.delete(messageTable);
    await db.delete(chatTable);
    await db.delete(projectTable);
    await db.delete(userTable);
  });

  async function seedBaseEntities() {
    await db.insert(userTable).values({
      id: MOCK_USER_ID,
      email: "compaction-tester@example.com",
    });

    await db.insert(projectTable).values({
      id: MOCK_PROJECT_ID,
      userId: MOCK_USER_ID,
      name: "Compaction Project",
      systemPrompt: "Compaction prompt",
    });

    await db.insert(chatTable).values({
      id: MOCK_CHAT_ID,
      userId: MOCK_USER_ID,
      projectId: MOCK_PROJECT_ID,
      title: "Chat for Compaction",
      agent: "context7",
    });
  }

  it("compact saves a summary when messages exceed threshold", async () => {
    await seedBaseEntities();

    const messages = buildMessageValues(30);
    await db.insert(messageTable).values(messages);

    const generateTextFn = vi.fn<CompactionAiPort["generateText"]>().mockResolvedValue(
      "## Goal\nTest conversation\n## Key Facts\nIntegration test\n",
    );

    const ai = buildAiPort({ generateText: generateTextFn });

    await compact(ai, MOCK_CHAT_ID, {
      keepRecentTokens: 20000,
      reserveTokens: 16384,
      contextWindow: 40000,
      enabled: true,
    });

    expect(generateTextFn).toHaveBeenCalled();

    const summaries = await db.select().from(chatSummaryTable).where(eq(chatSummaryTable.chatId, MOCK_CHAT_ID));
    expect(summaries).toHaveLength(1);
    expect(summaries[0].summary).toBe(
      "## Goal\nTest conversation\n## Key Facts\nIntegration test\n",
    );
    expect(summaries[0].tokensBefore).toBeGreaterThan(0);
    expect(summaries[0].modelUsed).toBeTruthy();
    expect(summaries[0].messageId).toBeTruthy();
  });

  it("compact does nothing for empty chat", async () => {
    await seedBaseEntities();

    const ai = buildAiPort();

    await compact(ai, MOCK_CHAT_ID, {
      keepRecentTokens: 20000,
      reserveTokens: 16384,
      enabled: true,
    });

    const summaries = await db.select().from(chatSummaryTable).where(eq(chatSummaryTable.chatId, MOCK_CHAT_ID));
    expect(summaries).toHaveLength(0);
  });

  it("compact respects abort signal", async () => {
    await seedBaseEntities();

    const controller = new AbortController();
    controller.abort();

    const messages = buildMessageValues(30);
    await db.insert(messageTable).values(messages);

    const ai = buildAiPort();

    await compact(
      ai,
      MOCK_CHAT_ID,
      {
        keepRecentTokens: 20000,
        reserveTokens: 16384,
        enabled: true,
      },
      controller.signal,
    );

    const summaries = await db.select().from(chatSummaryTable).where(eq(chatSummaryTable.chatId, MOCK_CHAT_ID));
    expect(summaries).toHaveLength(0);
  });
});
