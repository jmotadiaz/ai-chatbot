/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { textReply } from "@ai-chatbot/model-gateway-testing";
import type { GatewayScenario } from "@ai-chatbot/model-gateway-testing";
import { setupTestDb } from "../../helpers/db-setup";
import { setupGatewayHarness } from "../../helpers/gateway-harness";
import { answerDecision } from "../../helpers/gateway-decisions";
import {
  CHAT_MODE_ROUTING_QUESTION_KEY,
  createChatModeRouter,
} from "@/lib/features/chat/mode-routing/router";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import {
  chat as chatTable,
  message as messageTable,
  project as projectTable,
  user as userTable,
} from "@/lib/infrastructure/db/schema";
import { TEST_MODELS } from "@/tests/mocks/gateway/catalog";
import { dbMessageToChatbotMessage } from "@/lib/features/chat/utils";

vi.mock("server-only", () => ({}));

// Collaborators that are NOT inference are stubbed: memory retrieval (DB +
// embeddings, covered by its own suite) and memory extraction. Everything
// inference-related is REAL: the Chat Mode Router goes through `inferenceKit`
// over HTTP (`/v1/systemone`), and the resolved Chat Mode builds its agent
// through the kit too, answered by the scenario's `/v1/chat/completions`.
vi.mock("@/lib/features/memory/retrieval", () => ({
  getRelevantMemory: async () => null,
}));

vi.mock("@/lib/features/memory/extraction", () => ({
  extractMemoryFacts: async () => [],
}));

vi.mock("@/lib/features/chat/title", () => ({
  generateTitle: async () => "Auto chat",
}));

const { makeProcessChatResponse } = await import(
  "@/lib/features/chat/conversation/factory"
);
const { inferenceKit } = await import("@/lib/infrastructure/ai/inference-kit");

const gateway = setupGatewayHarness();

const USER_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const USER_MESSAGE_ID = "33333333-3333-3333-3333-333333333333";

/** The Chat Mode Router the composition root builds, over the real `decide`. */
const processChatResponse = makeProcessChatResponse(
  createChatModeRouter(inferenceKit.decide),
);

/** The Decisions answer of the chatbot E2E profile: `ctx7` → `context7`. */
const answering = (choice: string) =>
  answerDecision(CHAT_MODE_ROUTING_QUESTION_KEY, choice);

/** A routed scenario: the Decisions answer plus the generation reply. */
const routedTo = (choice: string) => ({
  decisions: answering(choice),
  chat: () => textReply("Respuesta"),
});

const decisionsBodies = (scenario: GatewayScenario) =>
  scenario.requests
    .filter((request) => request.path === "/v1/systemone")
    .map((request) => request.body as Record<string, unknown>);

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
  chatMode,
  projectId,
  text = "¿Cómo uso drizzle-kit?",
}: {
  chatMode: string;
  projectId?: string;
  text?: string;
}) => {
  const stream = await processChatResponse({
    messages: [userMessage(text)],
    selectedModel: TEST_MODELS[0]!.id,
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
    const scenario = await gateway.use(routedTo("ctx7"));

    await runTurn({ chatMode: "auto" });

    // The router asked the Decisions API once, with the turn's user message as
    // the question's state (the persisted metadata mirrors that same answer).
    const bodies = decisionsBodies(scenario);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      model: "decision-default",
      state: { latest_message: "¿Cómo uso drizzle-kit?", recent_context: "" },
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
    // Provenance is the Decisions response's, not a fixture: the values that
    // vary per call (latency) are asserted by shape, the rest exactly.
    expect(assistantRow.metadata.chatModeRouting).toMatchObject({
      requested: "auto",
      mode: "context7",
      reason: "routed",
      confidence: 1,
      probabilities: { ctx7: 1 / 3, web: 1 / 3, neither: 1 / 3 },
      modelId: "decision-default",
      provider: "mock-model-gateway",
      costUsd: 0,
      latencyMs: expect.any(Number),
    });

    // Round-trip through the read path used when a chat is reloaded.
    const [reloaded] = dbMessageToChatbotMessage([assistantRow]);
    expect(reloaded.metadata?.chatModeRouting).toEqual(
      assistantRow.metadata.chatModeRouting,
    );
    expect(reloaded.metadata?.chatModeRouting).toMatchObject({
      requested: "auto",
      mode: "context7",
      reason: "routed",
    });
  });

  it("does not route explicit chat modes and keeps the stored mode", async () => {
    await seedUser();
    const scenario = await gateway.use(routedTo("ctx7"));

    await runTurn({ chatMode: "web" });

    // Explicit modes never reach the Decisions API.
    expect(decisionsBodies(scenario)).toHaveLength(0);

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
    const scenario = await gateway.use(routedTo("ctx7"));

    await runTurn({ chatMode: "auto", projectId: PROJECT_ID });

    expect(decisionsBodies(scenario)).toHaveLength(0);

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

  it("degrades to the neutral fallback and still persists when the Decisions call fails", async () => {
    await seedUser();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await gateway.use({
      decisions: () => {
        throw new Error("decisions backend down");
      },
      chat: () => textReply("Respuesta"),
    });

    try {
      await runTurn({ chatMode: "auto" });
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
    // A failed classification is never a success default: no provenance from a
    // non-existent answer, the neutral tool-less branch instead.
    expect(assistantRow.metadata.chatModeRouting).toEqual({
      requested: "auto",
      mode: "neutral",
      reason: "fallback",
      modelId: "unavailable",
    });
  });
});
