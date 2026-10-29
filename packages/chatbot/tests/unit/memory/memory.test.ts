import { beforeEach, describe, expect, it } from "vitest";
import {
  GatewayScenarioError,
  embeddingsResponse,
  textReply,
} from "@ai-chatbot/model-gateway-testing";
import type {
  ChatReply,
  ChatRequest,
  EmbeddingsRequest,
  GatewayScenario,
  OperationReply,
  RecordedRequest,
} from "@ai-chatbot/model-gateway-testing";
import { EMBEDDING_DIMENSIONS } from "config";
import { setupTestDb } from "../../helpers/db-setup";
import { setupGatewayHarness } from "../../helpers/gateway-harness";
import { getRelevantMemory } from "@/lib/features/memory/retrieval";
import { MEMORY_DECOMPOSITION_SYSTEM_PROMPT } from "@/lib/features/memory/retrieval/prompts";
import { extractMemoryFacts } from "@/lib/features/memory/extraction";
import { MEMORY_EXTRACTION_SYSTEM_PROMPT } from "@/lib/features/memory/extraction/prompts";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import {
  user as userTable,
  userMemory as userMemoryTable,
} from "@/lib/infrastructure/db/schema";
import type { DB } from "@/lib/infrastructure/db/db";

/**
 * Social unit tests of user memory (ADR 0013): `getRelevantMemory` (retrieval)
 * and `extractMemoryFacts` (extraction + dedup) are exercised through their
 * public interfaces with the real inference kit, real SDK serialization, PGlite
 * persistence and the MSW transport of the Model Gateway toolkit. Nothing is
 * faked inside the process, and no gateway has to listen on `:4001`.
 *
 * Model answers are prepared fixtures: the decomposition and extraction replies
 * are declared per test, and embeddings are one-hot vectors so similarity
 * (`1 - cosine distance`) is decided by the fixture, not by a model.
 */
const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const unitVector = (index: number) => {
  const vector = Array(EMBEDDING_DIMENSIONS).fill(0);
  vector[index] = 1;
  return vector;
};

/** Similarity 1.0 with a fact seeded at the same vector (above the 0.85 thresholds). */
const MATCHING = unitVector(0);
/** Similarity 0 with `MATCHING`: never retrieved as contextual memory. */
const UNRELATED = unitVector(1);

const gateway = setupGatewayHarness();

let db: DB;

beforeEach(async () => {
  db = await setupTestDb();
  await db.insert(userTable).values([
    { id: USER_ID, email: "memory-tester@example.com" },
    { id: OTHER_USER_ID, email: "other-memory-tester@example.com" },
  ]);
});

const requestsOn = (scenario: GatewayScenario, path: string): RecordedRequest[] =>
  scenario.requests.filter((request) => request.path === path);

const chatBodies = (scenario: GatewayScenario) =>
  requestsOn(scenario, "/v1/chat/completions").map(
    (request) => request.body as ChatRequest,
  );

const systemContent = (body: ChatRequest): string => {
  const system = body.messages?.find((message) => message.role === "system");
  return typeof system?.content === "string" ? system.content : "";
};

/**
 * Routes the `fast-default` chat calls by their system prompt: the decomposition
 * answer and the extraction answer are prepared per test.
 */
const chatByPrompt = (answers: {
  decomposition?: (body: ChatRequest) => ChatReply;
  extraction?: (body: ChatRequest) => ChatReply;
}) => (request: ChatRequest): ChatReply => {
  const system = systemContent(request);
  if (system === MEMORY_DECOMPOSITION_SYSTEM_PROMPT && answers.decomposition) {
    return answers.decomposition(request);
  }
  if (system === MEMORY_EXTRACTION_SYSTEM_PROMPT && answers.extraction) {
    return answers.extraction(request);
  }
  throw new GatewayScenarioError(`unexpected chat call: ${system.slice(0, 40)}`, 400);
};

/** Each input gets the vector mapped to its text, or the fallback vector. */
const embeddingsByText =
  (vectors: Record<string, number[]>, fallback: number[] = MATCHING) =>
  (request: EmbeddingsRequest): OperationReply => {
    const inputs = Array.isArray(request.input) ? request.input : [request.input ?? ""];
    return embeddingsResponse(request, {
      dimensions: EMBEDDING_DIMENSIONS,
      vectors: inputs.map((input) => vectors[input] ?? fallback),
    });
  };

const decompositionReturning = (queries: string[]) => () =>
  textReply(JSON.stringify({ queries }));

const seedFact = async (fact: {
  userId?: string;
  category: "personal" | "professional" | "preferences";
  content: string;
  embedding: number[];
}) => {
  const [row] = await db
    .insert(userMemoryTable)
    .values({
      userId: fact.userId ?? USER_ID,
      category: fact.category,
      content: fact.content,
      embedding: fact.embedding,
    })
    .returning();
  return row;
};

const userMessage = (text: string): ChatbotMessage[] =>
  [{ id: "m1", role: "user", parts: [{ type: "text", text }] }] as ChatbotMessage[];

describe("getRelevantMemory", () => {
  it("returns null when the user has no stored facts", async () => {
    await gateway.use({
      chat: chatByPrompt({ decomposition: decompositionReturning(["location"]) }),
      embeddings: embeddingsByText({}),
    });

    await expect(
      getRelevantMemory({ userId: USER_ID, currentMessage: "Where do I live?" }),
    ).resolves.toBeNull();
  });

  it("always includes preferences and adds contextual facts above the similarity threshold", async () => {
    await seedFact({ category: "preferences", content: "Prefers concise answers", embedding: UNRELATED });
    await seedFact({ category: "personal", content: "Lives in Madrid", embedding: MATCHING });
    await seedFact({ category: "professional", content: "Works as a pilot", embedding: UNRELATED });

    await gateway.use({
      chat: chatByPrompt({ decomposition: decompositionReturning(["user location"]) }),
      embeddings: embeddingsByText({}),
    });

    const context = await getRelevantMemory({
      userId: USER_ID,
      currentMessage: "What is the weather like where I live?",
    });

    expect(context).toBe(
      "## What you know about the user\n- Prefers concise answers\n- Lives in Madrid",
    );
  });

  it("deduplicates a preference that also matches contextually", async () => {
    await seedFact({ category: "preferences", content: "Likes tea", embedding: MATCHING });

    await gateway.use({
      chat: chatByPrompt({
        decomposition: decompositionReturning(["favourite drink", "beverage preferences"]),
      }),
      embeddings: embeddingsByText({}),
    });

    const context = await getRelevantMemory({
      userId: USER_ID,
      currentMessage: "What should I drink?",
    });

    expect(context).toBe("## What you know about the user\n- Likes tea");
  });

  it("searches only personal and professional facts for contextual retrieval", async () => {
    await seedFact({ category: "personal", content: "Has a dog", embedding: MATCHING });

    await gateway.use({
      chat: chatByPrompt({ decomposition: decompositionReturning(["pets"]) }),
      embeddings: embeddingsByText({}),
    });

    const context = await getRelevantMemory({
      userId: USER_ID,
      currentMessage: "Any pet ideas?",
    });

    expect(context).toBe("## What you know about the user\n- Has a dog");
  });

  it("never returns another user's facts", async () => {
    await seedFact({
      userId: OTHER_USER_ID,
      category: "personal",
      content: "Someone else's address",
      embedding: MATCHING,
    });

    await gateway.use({
      chat: chatByPrompt({ decomposition: decompositionReturning(["address"]) }),
      embeddings: embeddingsByText({}),
    });

    await expect(
      getRelevantMemory({ userId: USER_ID, currentMessage: "Where do I live?" }),
    ).resolves.toBeNull();
  });

  it("skips the model entirely for a blank message and still returns preferences", async () => {
    await seedFact({ category: "preferences", content: "Writes in English", embedding: UNRELATED });

    const scenario = await gateway.use({});

    const context = await getRelevantMemory({ userId: USER_ID, currentMessage: "   " });

    expect(context).toBe("## What you know about the user\n- Writes in English");
    expect(requestsOn(scenario, "/v1/chat/completions")).toHaveLength(0);
    expect(requestsOn(scenario, "/v1/embeddings")).toHaveLength(0);
  });

  it("falls back to the original message when decomposition fails, so contextual facts are still searched", async () => {
    await seedFact({ category: "personal", content: "Lives in Madrid", embedding: MATCHING });

    const scenario = await gateway.use({
      chat: chatByPrompt({
        decomposition: () => {
          throw new GatewayScenarioError("decomposition unavailable", 400);
        },
      }),
      embeddings: embeddingsByText({}),
    });

    const context = await getRelevantMemory({
      userId: USER_ID,
      currentMessage: "Where do I live?",
    });

    expect(context).toBe("## What you know about the user\n- Lives in Madrid");
    const [embedded] = requestsOn(scenario, "/v1/embeddings").map(
      (request) => (request.body as EmbeddingsRequest).input,
    );
    expect(embedded).toEqual(["Where do I live?"]);
  });
});

describe("extractMemoryFacts", () => {
  it("stores each extracted fact with its category, source and embedding", async () => {
    const scenario = await gateway.use({
      chat: chatByPrompt({
        extraction: () =>
          textReply(
            JSON.stringify({
              facts: [
                { category: "personal", content: "Lives in Madrid" },
                { category: "preferences", content: "Prefers metric units" },
              ],
            }),
          ),
      }),
      embeddings: embeddingsByText({
        "Lives in Madrid": unitVector(2),
        "Prefers metric units": unitVector(3),
      }),
    });

    await extractMemoryFacts({
      messages: userMessage("I live in Madrid and prefer metric units."),
      userId: USER_ID,
    });

    const rows = await db.select().from(userMemoryTable);
    expect(rows).toHaveLength(2);
    const byContent = Object.fromEntries(rows.map((row) => [row.content, row]));
    expect(byContent["Lives in Madrid"]).toMatchObject({
      userId: USER_ID,
      category: "personal",
      source: "extracted",
    });
    expect(byContent["Prefers metric units"]).toMatchObject({
      category: "preferences",
      source: "extracted",
    });

    const [extraction] = chatBodies(scenario);
    expect(extraction!.model).toBe("fast-default");
    expect(requestsOn(scenario, "/v1/embeddings")).toHaveLength(1);
  });

  it("updates a similar existing fact in place instead of inserting a duplicate", async () => {
    const existing = await seedFact({
      category: "personal",
      content: "Lives in Madrid",
      embedding: MATCHING,
    });

    await gateway.use({
      chat: chatByPrompt({
        extraction: () =>
          textReply(
            JSON.stringify({
              facts: [{ category: "personal", content: "Moved to Barcelona" }],
            }),
          ),
      }),
      embeddings: embeddingsByText({ "Moved to Barcelona": MATCHING }),
    });

    await extractMemoryFacts({
      messages: userMessage("I moved to Barcelona."),
      userId: USER_ID,
    });

    const rows = await db.select().from(userMemoryTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: existing.id,
      content: "Moved to Barcelona",
      source: "extracted",
    });
  });

  it("inserts a fact that is not similar enough to any stored fact", async () => {
    await seedFact({ category: "personal", content: "Lives in Madrid", embedding: MATCHING });

    await gateway.use({
      chat: chatByPrompt({
        extraction: () =>
          textReply(
            JSON.stringify({
              facts: [{ category: "professional", content: "Is a pilot" }],
            }),
          ),
      }),
      embeddings: embeddingsByText({ "Is a pilot": UNRELATED }),
    });

    await extractMemoryFacts({ messages: userMessage("I fly planes."), userId: USER_ID });

    const rows = await db.select().from(userMemoryTable);
    expect(rows.map((row) => row.content).sort()).toEqual(["Is a pilot", "Lives in Madrid"]);
  });

  it("writes nothing and skips embeddings when the model extracts no facts", async () => {
    const scenario = await gateway.use({
      chat: chatByPrompt({
        extraction: () => textReply(JSON.stringify({ facts: [] })),
      }),
    });

    await extractMemoryFacts({ messages: userMessage("Hello!"), userId: USER_ID });

    expect(await db.select().from(userMemoryTable)).toHaveLength(0);
    expect(requestsOn(scenario, "/v1/embeddings")).toHaveLength(0);
  });

  it("calls the model for a message without text using its role prefix", async () => {
    const scenario = await gateway.use({
      chat: chatByPrompt({
        extraction: () => textReply(JSON.stringify({ facts: [] })),
      }),
    });
    const messageWithoutText = [{ id: "m2", role: "user", parts: [] }] as ChatbotMessage[];

    await extractMemoryFacts({ messages: messageWithoutText, userId: USER_ID });

    const [body] = chatBodies(scenario);
    expect(body?.messages?.find((message) => message.role === "user")?.content).toBe("user: ");
    expect(await db.select().from(userMemoryTable)).toHaveLength(0);
  });

  it("propagates a failed extraction so the caller can report it", async () => {
    await gateway.use({
      chat: () => {
        throw new GatewayScenarioError("extraction unavailable", 400);
      },
    });

    await expect(
      extractMemoryFacts({ messages: userMessage("I live in Madrid."), userId: USER_ID }),
    ).rejects.toThrow();
    expect(await db.select().from(userMemoryTable)).toHaveLength(0);
  });
});
