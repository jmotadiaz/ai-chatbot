/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeRetrieveResourceChunks } from "../../../lib/features/rag/retrieve/factory";
import type { RagRetrieveAiPort } from "../../../lib/features/rag/retrieve/ports";
import type { RerankResult } from "../../../lib/features/foundation-model/types";
import { setupTestDb } from "../db-setup";
import {
  resource as resourceTable,
  chunk as chunkTable,
  embedding as embeddingTable,
  user as userTable,
  project as projectTable,
} from "@/lib/infrastructure/db/schema";

const vectorAgenticGlobal = Array(768).fill(0.0);
vectorAgenticGlobal[0] = 1.0;

const createMockAiPort = (options?: {
  rerankResults?: RerankResult[];
  shouldFailRerank?: boolean;
}): RagRetrieveAiPort => ({
  generateEmbeddings: async () => [vectorAgenticGlobal],
  rerank: async () => {
    if (options?.shouldFailRerank) throw new Error("Reranker failed");
    return options?.rerankResults || [];
  },
});

const BASE_USER_ID = "11111111-1111-1111-1111-111111111111";
const BASE_PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const R1_UUID = "33333333-3333-3333-3333-333333333333";
const R2_UUID = "44444444-4444-4444-4444-444444444444";
const C1_UUID = "55555555-5555-5555-5555-555555555555";
const C2_UUID = "66666666-6666-6666-6666-666666666666";

describe("RAG Retrieve Pipeline - Sociable Unit Tests", () => {
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
      email: "retrieve-tester@example.com",
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
    embeddingVector,
  }: {
    resourceId: string;
    chunkId: string;
    content: string;
    title: string;
    position: number;
    embeddingVector: number[];
  }) {
    // Check if resource already exists
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

    await db.insert(embeddingTable).values({
      chunkId,
      embedding: embeddingVector,
    });
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

  it("returns an empty array immediately if multiHopQueries is empty", async () => {
    const ai = createMockAiPort();
    const retrieve = makeRetrieveResourceChunks(ai);

    const result = await retrieve({ ...baseInput, multiHopQueries: [] });

    expect(result).toEqual([]);
  });

  it("returns chunks sorted by original document position", async () => {
    await seedUserAndProject();

    const vectorAgentic = Array(768).fill(0.0);
    vectorAgentic[0] = 1.0;

    await seedResourceChunkAndEmbedding({
      resourceId: R1_UUID,
      chunkId: C1_UUID,
      content: "content 1",
      title: "Resource A",
      position: 2,
      embeddingVector: vectorAgentic,
    });

    await seedResourceChunkAndEmbedding({
      resourceId: R1_UUID,
      chunkId: C2_UUID,
      content: "content 2",
      title: "Resource A",
      position: 1,
      embeddingVector: vectorAgentic,
    });

    const ai = createMockAiPort({
      rerankResults: [
        { originalIndex: 0, score: 0.95 }, // chunk1
        { originalIndex: 1, score: 0.9 }, // chunk2
      ],
    });
    const retrieve = makeRetrieveResourceChunks(ai);

    const result = await retrieve(baseInput);

    // Expect position 1 (chunk2) before position 2 (chunk1) because they belong to the same resource
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(C2_UUID);
    expect(result[1].id).toBe(C1_UUID);
    expect(result[0]).toHaveProperty("resourceTitle", "Resource A");
  });

  it("deduplicates chunks returned from multiple search types", async () => {
    await seedUserAndProject();

    const vectorAgentic = Array(768).fill(0.0);
    vectorAgentic[0] = 1.0;

    await seedResourceChunkAndEmbedding({
      resourceId: R1_UUID,
      chunkId: C1_UUID,
      content: "shared content",
      title: "R1",
      position: 1,
      embeddingVector: vectorAgentic,
    });

    // AI receives only 1 document because it was deduplicated
    const ai = createMockAiPort({
      rerankResults: [
        { originalIndex: 0, score: 0.95 },
      ],
    });
    const retrieve = makeRetrieveResourceChunks(ai);

    const result = await retrieve(baseInput);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(C1_UUID);
  });

  it("filters out chunks that fall below the minimum minRagResourcesScore", async () => {
    await seedUserAndProject();

    const vectorAgentic = Array(768).fill(0.0);
    vectorAgentic[0] = 1.0;

    await seedResourceChunkAndEmbedding({
      resourceId: R1_UUID,
      chunkId: C1_UUID,
      content: "Good chunk",
      title: "R1",
      position: 1,
      embeddingVector: vectorAgentic,
    });

    await seedResourceChunkAndEmbedding({
      resourceId: R2_UUID,
      chunkId: C2_UUID,
      content: "Bad chunk",
      title: "R2",
      position: 1,
      embeddingVector: vectorAgentic,
    });

    const ai = createMockAiPort({
      rerankResults: [
        { originalIndex: 0, score: 0.85 }, // Passes threshold (0.8)
        { originalIndex: 1, score: 0.7 }, // Fails threshold
      ],
    });
    const retrieve = makeRetrieveResourceChunks(ai);

    const result = await retrieve(baseInput);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(C1_UUID);
  });

  it("gracefully returns an empty array if the reranker fails", async () => {
    await seedUserAndProject();

    const vectorAgentic = Array(768).fill(0.0);
    vectorAgentic[0] = 1.0;

    await seedResourceChunkAndEmbedding({
      resourceId: R1_UUID,
      chunkId: C1_UUID,
      content: "content",
      title: "R1",
      position: 1,
      embeddingVector: vectorAgentic,
    });

    const ai = createMockAiPort({ shouldFailRerank: true });
    const retrieve = makeRetrieveResourceChunks(ai);

    const result = await retrieve(baseInput);

    expect(result).toEqual([]);
  });
});
