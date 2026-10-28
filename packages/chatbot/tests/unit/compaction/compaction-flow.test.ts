/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  GatewayScenarioError,
  createGatewayScenario,
  textReply,
} from "@ai-chatbot/model-gateway-testing";
import type { ChatReply, GatewayScenario } from "@ai-chatbot/model-gateway-testing";
import { setupTestDb } from "../../helpers/db-setup";
import { setupMswServer } from "../../helpers/msw-server";
import {
  chat as chatTable,
  message as messageTable,
  chatSummary as chatSummaryTable,
  user as userTable,
  project as projectTable,
} from "@/lib/infrastructure/db/schema";
import { compact } from "@/lib/features/compaction/orchestration";
import { warmModelCatalog } from "@/lib/infrastructure/ai/catalog";

/**
 * Compaction persistence flow as a social unit test (ADR 0013): PGlite in
 * memory for persistence, MSW at the Model Gateway HTTP seam for inference.
 * Nothing here needs a PostgreSQL container or a gateway listening on `:4001`.
 */
const MOCK_USER_ID = "11111111-1111-1111-1111-111111111111";
const MOCK_PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const MOCK_CHAT_ID = "33333333-3333-3333-3333-333333333333";

const SUMMARY_TEXT =
  "## Goal\nTest conversation\n## Relevant User Details\nIntegration test\n";

/**
 * Consumer-owned catalog: the toolkit passes entries through, and the kit needs
 * the two Default Model Contracts the feature selects from so it can resolve
 * their metadata synchronously.
 */
const CATALOG = {
  public: [],
  internal: [{ id: "reasoning-default" }, { id: "vision-default" }],
};

const server = setupMswServer();

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

const useScenario = async (
  chat: (request: unknown) => ChatReply,
): Promise<GatewayScenario> => {
  const scenario = createGatewayScenario({ catalog: CATALOG, chat });
  server.use(...scenario.handlers);
  // The same warm-up point production uses; the catalog fetch is intercepted
  // by this scenario's MSW handlers.
  await warmModelCatalog();
  return scenario;
};

const inferenceRequests = (scenario: GatewayScenario) =>
  scenario.requests.filter((request) => request.path === "/v1/chat/completions");

describe("compaction integration flow", () => {
  let db: any;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  afterEach(async () => {
    // Cleanup is scoped to this file's own rows: the database is a dedicated
    // in-memory PGlite instance, never a shared PostgreSQL server.
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
      chatMode: "context7",
    });
  }

  const summaries = () =>
    db
      .select()
      .from(chatSummaryTable)
      .where(eq(chatSummaryTable.chatId, MOCK_CHAT_ID));

  it("compact saves a summary when messages exceed threshold", async () => {
    await seedBaseEntities();

    await db.insert(messageTable).values(buildMessageValues(30));

    const scenario = await useScenario(() => textReply(SUMMARY_TEXT));

    await compact(MOCK_CHAT_ID, {
      keepRecentTokens: 20000,
      reserveTokens: 16384,
      contextWindow: 40000,
      enabled: true,
    });

    // The inference went through the Gateway HTTP contract, with the text
    // contract the feature selects for turns without multimedia.
    const requests = inferenceRequests(scenario);
    expect(requests).toHaveLength(1);
    expect((requests[0]!.body as { model?: string }).model).toBe(
      "reasoning-default",
    );

    const rows = await summaries();
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe(SUMMARY_TEXT);
    expect(rows[0].tokensBefore).toBeGreaterThan(0);
    expect(rows[0].modelUsed).toBe("reasoning-default");
    expect(rows[0].messageId).toBeTruthy();
  });

  it("compact does nothing for empty chat", async () => {
    await seedBaseEntities();

    const scenario = await useScenario(() => textReply(SUMMARY_TEXT));

    await compact(MOCK_CHAT_ID, {
      keepRecentTokens: 20000,
      reserveTokens: 16384,
      enabled: true,
    });

    expect(await summaries()).toHaveLength(0);
    expect(inferenceRequests(scenario)).toHaveLength(0);
  });

  it("compact respects abort signal", async () => {
    await seedBaseEntities();

    const controller = new AbortController();
    controller.abort();

    await db.insert(messageTable).values(buildMessageValues(30));

    const scenario = await useScenario(() => textReply(SUMMARY_TEXT));

    await compact(
      MOCK_CHAT_ID,
      {
        keepRecentTokens: 20000,
        reserveTokens: 16384,
        enabled: true,
      },
      controller.signal,
    );

    expect(await summaries()).toHaveLength(0);
    expect(inferenceRequests(scenario)).toHaveLength(0);
  });

  it("does not persist a summary when summarization fails", async () => {
    await seedBaseEntities();

    await db.insert(messageTable).values(buildMessageValues(30));

    await useScenario(() => {
      throw new GatewayScenarioError("summarizer unavailable", 400);
    });

    await expect(
      compact(MOCK_CHAT_ID, {
        keepRecentTokens: 20000,
        reserveTokens: 16384,
        contextWindow: 40000,
        enabled: true,
      }),
    ).rejects.toThrow();

    expect(await summaries()).toHaveLength(0);
  });
});
