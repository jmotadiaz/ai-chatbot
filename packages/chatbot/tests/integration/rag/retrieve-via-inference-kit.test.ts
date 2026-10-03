/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb } from "../../helpers/db-setup";
import {
  resource as resourceTable,
  chunk as chunkTable,
  embedding as embeddingTable,
  user as userTable,
  project as projectTable,
} from "@/lib/infrastructure/db/schema";

/**
 * `tests/integration/rag/retrieve.test.ts` fakes `RagRetrieveAiPort` directly
 * (`createMockAiPort`), so it never exercises the real
 * `generateEmbeddings`/`rerank` wiring in
 * `lib/features/rag/retrieve/{embeddings,index}.ts`, which now calls the
 * Inference Kit's `embed`/`rerank` operations instead of the pre-ticket-04
 * `providers.embedding`/`providers.rerank`. This file instead builds a real
 * kit (`createInferenceKit`) with deterministic fake embedding/rerank
 * *clients* — the same per-kind override seam
 * (`embeddingClients`/`rerankClients`) the chatbot's test-mode composition
 * root uses — and mocks only that composition root
 * (`@/lib/infrastructure/ai/inference-kit`), so the real
 * `retrieveResourceChunks` singleton (`lib/features/rag/retrieve/index.ts`)
 * runs its actual adapter over it. Reuses the DB/fixture setup from
 * `retrieve.test.ts`.
 *
 * `vi.hoisted` shares the canned ranking between the hoisted mock factory
 * below and each test body, so every test can drive a different rerank
 * result without rebuilding the kit (mirrors the pattern in
 * `tests/integration/chat/neutral-branch.test.ts`).
 */
const rerankState = vi.hoisted(() => ({
  ranking: [] as Array<{ index: number; relevanceScore: number }>,
}));

vi.mock("@/lib/infrastructure/ai/inference-kit", async () => {
  const { createInferenceKit } = await import("inference");
  const { MockEmbeddingModelV3, MockRerankingModelV3 } = await import("ai/test");

  // One-hot 768-dim vector, matching every chunk's seeded embedding below —
  // deterministic "always similar" stand-in for a real embedding call, same
  // shape (768) `EMBEDDING_MODELS` declares for the real `embedding` role.
  const QUERY_VECTOR = Array(768).fill(0);
  QUERY_VECTOR[0] = 1;

  const inferenceKit = createInferenceKit({
    embeddingClients: {
      google: (modelId) =>
        new MockEmbeddingModelV3({
          modelId,
          doEmbed: async ({ values }) => ({
            embeddings: values.map(() => QUERY_VECTOR),
            usage: { tokens: values.length },
            warnings: [],
          }),
        }),
    },
    rerankClients: {
      cohere: (modelId) =>
        new MockRerankingModelV3({
          modelId,
          doRerank: async () => ({ ranking: rerankState.ranking }),
        }),
    },
  });

  return { inferenceKit };
});

const { retrieveResourceChunks } = await import("@/lib/features/rag/retrieve");

const BASE_USER_ID = "11111111-1111-1111-1111-111111111111";
const BASE_PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const R1_UUID = "33333333-3333-3333-3333-333333333333";
const R2_UUID = "44444444-4444-4444-4444-444444444444";
const C1_UUID = "55555555-5555-5555-5555-555555555555";
const C2_UUID = "66666666-6666-6666-6666-666666666666";

describe("RAG retrieve integration (through the Inference Kit's embed/rerank)", () => {
  let db: any;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  afterEach(async () => {
    await db.delete(embeddingTable);
    await db.delete(chunkTable);
    await db.delete(resourceTable);
    await db.delete(projectTable);
    await db.delete(userTable);
  });

  async function seedUserAndProject() {
    await db.insert(userTable).values({
      id: BASE_USER_ID,
      email: "retrieve-via-kit-tester@example.com",
    });

    await db.insert(projectTable).values({
      id: BASE_PROJECT_ID,
      userId: BASE_USER_ID,
      name: "RAG Project",
      systemPrompt: "RAG prompt",
    });
  }

  async function seedResourceChunkAndEmbedding({
    resourceId,
    chunkId,
    content,
    title,
    position,
  }: {
    resourceId: string;
    chunkId: string;
    content: string;
    title: string;
    position: number;
  }) {
    const [existingResource] = await db
      .select()
      .from(resourceTable)
      .where(eq(resourceTable.id, resourceId));

    if (!existingResource) {
      await db.insert(resourceTable).values({
        id: resourceId,
        title,
        userId: BASE_USER_ID,
        projectId: BASE_PROJECT_ID,
      });
    }

    await db.insert(chunkTable).values({
      id: chunkId,
      resourceId,
      content,
      type: "text",
      position,
    });

    // Same one-hot vector as the query embedding above, so semantic search
    // matches every seeded chunk regardless of content.
    const vector = Array(768).fill(0);
    vector[0] = 1;
    await db.insert(embeddingTable).values({ chunkId, embedding: vector });
  }

  const baseInput = {
    multiHopQueries: ["test query"],
    queryRewriting: "rewritten query",
    previousResources: [],
    userId: BASE_USER_ID,
    projectId: undefined,
    ragMaxResources: 5,
    minRagResourcesScore: 0.8,
  };

  it("filters out chunks scored below the threshold by the real rerank operation", async () => {
    await seedUserAndProject();
    await seedResourceChunkAndEmbedding({
      resourceId: R1_UUID,
      chunkId: C1_UUID,
      content: "Good chunk",
      title: "R1",
      position: 1,
    });
    await seedResourceChunkAndEmbedding({
      resourceId: R2_UUID,
      chunkId: C2_UUID,
      content: "Bad chunk",
      title: "R2",
      position: 1,
    });

    // Passes the 0.8 threshold at index 0, fails it at index 1 — same fixture
    // shape as the port-level test's "filters out chunks below threshold".
    rerankState.ranking = [
      { index: 0, relevanceScore: 0.85 },
      { index: 1, relevanceScore: 0.7 },
    ];

    const result = await retrieveResourceChunks(baseInput);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(C1_UUID);
  });

  it("orders chunks by the real rerank operation's ranking, not by insertion order", async () => {
    await seedUserAndProject();
    // C1 inserted first, C2 second — the opposite of the rerank order below.
    await seedResourceChunkAndEmbedding({
      resourceId: R1_UUID,
      chunkId: C1_UUID,
      content: "First inserted",
      title: "R1",
      position: 1,
    });
    await seedResourceChunkAndEmbedding({
      resourceId: R2_UUID,
      chunkId: C2_UUID,
      content: "Second inserted",
      title: "R2",
      position: 1,
    });

    // Both clear the 0.8 threshold, but index 1 (C2) outranks index 0 (C1).
    rerankState.ranking = [
      { index: 1, relevanceScore: 0.95 },
      { index: 0, relevanceScore: 0.85 },
    ];

    const result = await retrieveResourceChunks(baseInput);

    expect(result.map((r) => r.id)).toEqual([C2_UUID, C1_UUID]);
  });
});
