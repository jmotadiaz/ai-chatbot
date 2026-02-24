import { describe, it, expect } from "vitest";
import { makeRetrieveResourceChunks } from "../../../lib/features/rag/retrieve/factory";
import {
  RagRetrieveDbPort,
  RagRetrieveAiPort,
} from "../../../lib/features/rag/retrieve/ports";
import { SimilarChunk, SimilarChunks } from "../../../lib/features/rag/types";
import { RerankResult } from "../../../lib/features/foundation-model/types";

const createMockDbPort = (options?: {
  keywordResults?: SimilarChunks;
  semanticResults?: SimilarChunks;
}): RagRetrieveDbPort => ({
  findSimilarChunksBySemantic: async () => options?.semanticResults || [],
  findSimilarChunksByKeyword: async () => options?.keywordResults || [],
});

const createMockAiPort = (options?: {
  rerankResults?: RerankResult[];
  shouldFailRerank?: boolean;
}): RagRetrieveAiPort => ({
  generateEmbeddings: async () => [[0.1, 0.2, 0.3]],
  rerank: async () => {
    if (options?.shouldFailRerank) throw new Error("Reranker failed");
    return options?.rerankResults || [];
  },
});

const createChunk = (overrides: Partial<SimilarChunk>): SimilarChunk => ({
  id: "default-id",
  content: "default content",
  resourceTitle: "Default Resource",
  resourceUrl: null,
  position: 0,
  similarity: 1,
  type: "text",
  language: null,
  boundaryType: null,
  boundaryName: null,
  ...overrides,
});

describe("RAG Retrieve Pipeline", () => {
  const baseInput = {
    multiHopQueries: ["test query"],
    queryRewriting: "rewritten query",
    previousResources: [],
    userId: "user_123",
    projectId: "proj_123",
    ragMaxResources: 5,
    minRagResourcesScore: 0.8,
  };

  it("returns an empty array immediately if multiHopQueries is empty", async () => {
    const db = createMockDbPort();
    const ai = createMockAiPort();
    const retrieve = makeRetrieveResourceChunks(db, ai);

    const result = await retrieve({ ...baseInput, multiHopQueries: [] });

    expect(result).toEqual([]);
  });

  it("returns chunks sorted by original document position", async () => {
    // Chunks from DB - intentionally out of order regarding position
    const chunk1 = createChunk({
      id: "c1",
      content: "content 1",
      resourceTitle: "Resource A",
      position: 2,
    });
    const chunk2 = createChunk({
      id: "c2",
      content: "content 2",
      resourceTitle: "Resource A",
      position: 1,
    });

    const db = createMockDbPort({ semanticResults: [chunk1, chunk2] });
    // AI returns both chunks scored highly enough
    const ai = createMockAiPort({
      rerankResults: [
        { originalIndex: 0, score: 0.95 }, // chunk1
        { originalIndex: 1, score: 0.9 }, // chunk2
      ],
    });
    const retrieve = makeRetrieveResourceChunks(db, ai);

    const result = await retrieve(baseInput);

    // Expect position 1 (chunk2) before position 2 (chunk1) because they belong to the same resource
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("c2");
    expect(result[1].id).toBe("c1");

    // Verify output format
    expect(result[0]).toHaveProperty("resourceTitle", "Resource A");
  });

  it("deduplicates chunks returned from multiple search types", async () => {
    const sharedChunk = createChunk({
      id: "c1",
      content: "shared content",
      resourceTitle: "R1",
      position: 1,
    });

    // Return the SAME chunk from both semantic and keyword search mocks
    const db = createMockDbPort({
      semanticResults: [sharedChunk],
      keywordResults: [sharedChunk],
    });

    // AI receives only 1 document because it was deduplicated
    const ai = createMockAiPort({
      rerankResults: [
        { originalIndex: 0, score: 0.95 }, // Only index 0 exists
      ],
    });
    const retrieve = makeRetrieveResourceChunks(db, ai);

    const result = await retrieve(baseInput);

    // Result should only contain one instance
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
  });

  it("filters out chunks that fall below the minimum minRagResourcesScore", async () => {
    const chunk1 = createChunk({
      id: "c1",
      content: "Good chunk",
      resourceTitle: "R1",
      position: 1,
    });
    const chunk2 = createChunk({
      id: "c2",
      content: "Bad chunk",
      resourceTitle: "R2",
      position: 1,
    });

    const db = createMockDbPort({ semanticResults: [chunk1, chunk2] });

    const ai = createMockAiPort({
      rerankResults: [
        { originalIndex: 0, score: 0.85 }, // Passes threshold (0.8)
        { originalIndex: 1, score: 0.7 }, // Fails threshold
      ],
    });
    const retrieve = makeRetrieveResourceChunks(db, ai);

    const result = await retrieve(baseInput);

    // Only chunk1 should be returning
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
  });

  it("gracefully returns an empty array if the reranker fails", async () => {
    const chunk1 = createChunk({
      id: "c1",
      content: "content",
      resourceTitle: "R1",
      position: 1,
    });

    const db = createMockDbPort({ semanticResults: [chunk1] });
    const ai = createMockAiPort({ shouldFailRerank: true });
    const retrieve = makeRetrieveResourceChunks(db, ai);

    const result = await retrieve(baseInput);

    expect(result).toEqual([]);
  });
});
