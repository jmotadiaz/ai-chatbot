/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  embeddingsResponse,
  rerankResponse,
} from "@ai-chatbot/model-gateway-testing";
import type {
  EmbeddingsRequest,
  GatewayScenario,
  OperationReply,
  RecordedRequest,
  RerankRequest,
} from "@ai-chatbot/model-gateway-testing";
import { EMBEDDING_DIMENSIONS } from "config";
import { setupTestDb } from "../../helpers/db-setup";
import { setupGatewayHarness } from "../../helpers/gateway-harness";
import { retrieveResourceChunks } from "@/lib/features/rag/retrieve";
import {
  resource as resourceTable,
  chunk as chunkTable,
  embedding as embeddingTable,
  projectResource as projectResourceTable,
  user as userTable,
  project as projectTable,
} from "@/lib/infrastructure/db/schema";

/**
 * RAG retrieval as a social unit test (ADR 0013): the feature is exercised
 * through its public interface (`retrieveResourceChunks`), persistence is PGlite
 * in memory and inference is the real kit over MSW at the Model Gateway HTTP
 * seam. Embeddings and rankings are prepared fixtures — no provider, no invented
 * heuristic — so these tests need neither a PostgreSQL container nor a gateway
 * listening on `:4001`.
 *
 * This file replaces `tests/integration/rag/retrieve.test.ts` (which faked the
 * deleted `RagRetrieveAiPort`) and
 * `tests/integration/rag/retrieve-via-inference-kit.test.ts` (which existed only
 * because that fake bypassed the adapter). Retrieval is independent of
 * ingestion: nothing here ingests a resource, the rows are seeded directly.
 */
const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";

const R1_UUID = "33333333-3333-4333-8333-333333333333";
const R2_UUID = "44444444-4444-4444-8444-444444444444";
const C1_UUID = "66666666-6666-4666-8666-666666666666";
const C2_UUID = "77777777-7777-4777-8777-777777777777";
const C3_UUID = "88888888-8888-4888-8888-888888888888";

/** One-hot vector: `unitVector(0)` vs `unitVector(0)` = similarity 1.0. */
const unitVector = (index: number) => {
  const vector = Array(EMBEDDING_DIMENSIONS).fill(0);
  vector[index] = 1;
  return vector;
};

/** Matches the seeded chunk embeddings, well above the 0.5 semantic threshold. */
const SIMILAR_VECTOR = unitVector(0);
/** Orthogonal to the query: similarity 0, below the 0.5 semantic threshold. */
const ORTHOGONAL_VECTOR = unitVector(1);

const gateway = setupGatewayHarness();

const embeddingRequests = (scenario: GatewayScenario): RecordedRequest[] =>
  scenario.requests.filter((request) => request.path === "/v1/embeddings");

const rerankRequests = (scenario: GatewayScenario): RecordedRequest[] =>
  scenario.requests.filter((request) => request.path === "/v1/rerank");

/**
 * Prepared `/v1/embeddings` answer: every input gets the given vector, so the
 * search similarity is decided by the fixture, never by a model.
 */
const embeddingsReturning =
  (vector: number[] = SIMILAR_VECTOR) =>
  (request: EmbeddingsRequest): OperationReply => {
    const inputs = Array.isArray(request.input)
      ? request.input
      : [request.input ?? ""];
    return embeddingsResponse(request, {
      dimensions: EMBEDDING_DIMENSIONS,
      vectors: inputs.map(() => vector),
    });
  };

/**
 * Prepared `/v1/rerank` answer ranked by document content. Each result's
 * `index` is the position of `document` in the array the feature sent, which is
 * exactly the association the pipeline has to honor.
 */
const rankingByContent =
  (scores: Readonly<Record<string, number>>) =>
  (request: RerankRequest): OperationReply => {
    const results = (request.documents ?? [])
      .map((document, index) => ({
        index,
        relevance_score: scores[document] ?? 0,
      }))
      .sort((a, b) => b.relevance_score - a.relevance_score);
    return rerankResponse(request, { results });
  };

const indexOfDocument = (request: RerankRequest, content: string): number => {
  const index = (request.documents ?? []).indexOf(content);
  if (index < 0) {
    throw new Error(`Rerank request did not include the document: ${content}`);
  }
  return index;
};

describe("RAG retrieval", () => {
  let db: any;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  afterEach(async () => {
    // Scoped to this file's rows: the database is a dedicated in-memory PGlite
    // instance, never a shared PostgreSQL server.
    await db.delete(embeddingTable);
    await db.delete(chunkTable);
    await db.delete(projectResourceTable);
    await db.delete(resourceTable);
    await db.delete(projectTable);
    await db.delete(userTable);
  });

  async function seedUserAndProject() {
    await db.insert(userTable).values([
      { id: USER_ID, email: "retrieval-tester@example.com" },
      { id: OTHER_USER_ID, email: "other-tester@example.com" },
    ]);
    await db.insert(projectTable).values({
      id: PROJECT_ID,
      userId: USER_ID,
      name: "RAG Project",
      systemPrompt: "RAG prompt",
    });
  }

  async function seedResource({
    id,
    title,
    userId = USER_ID,
    url = null,
  }: {
    id: string;
    title: string;
    userId?: string | null;
    url?: string | null;
  }) {
    await db.insert(resourceTable).values({ id, title, userId, url });
  }

  async function linkResourceToProject(resourceId: string) {
    await db
      .insert(projectResourceTable)
      .values({ projectId: PROJECT_ID, resourceId });
  }

  async function seedChunk({
    resourceId,
    id,
    content,
    position = 0,
    vector = SIMILAR_VECTOR,
  }: {
    resourceId: string;
    id: string;
    content: string;
    position?: number;
    vector?: number[];
  }) {
    await db
      .insert(chunkTable)
      .values({ id, resourceId, content, type: "text", position });
    await db.insert(embeddingTable).values({ chunkId: id, embedding: vector });
  }

  const baseInput = {
    multiHopQueries: ["test query"],
    queryRewriting: "rewritten query",
    previousResources: [],
    userId: USER_ID,
    projectId: undefined,
    ragMaxResources: 5,
    minRagResourcesScore: 0.8,
  };

  it("returns no chunks and calls no inference when there are no queries", async () => {
    await seedUserAndProject();

    const scenario = await gateway.use({
      embeddings: () => {
        throw new Error("embeddings must not be called");
      },
      rerank: () => {
        throw new Error("rerank must not be called");
      },
    });

    const result = await retrieveResourceChunks({
      ...baseInput,
      multiHopQueries: [],
    });

    expect(result).toEqual([]);
    expect(embeddingRequests(scenario)).toHaveLength(0);
    expect(rerankRequests(scenario)).toHaveLength(0);
  });

  it("embeds the queries for retrieval and keeps only chunks above the semantic threshold", async () => {
    await seedUserAndProject();
    await seedResource({
      id: R1_UUID,
      title: "Resource A",
      url: "https://example.com/a",
    });
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "semantically similar paragraph",
    });
    await seedResource({ id: R2_UUID, title: "Resource B" });
    await seedChunk({
      resourceId: R2_UUID,
      id: C2_UUID,
      content: "unrelated paragraph",
      vector: ORTHOGONAL_VECTOR,
    });

    const scenario = await gateway.use({
      embeddings: embeddingsReturning(),
      rerank: rankingByContent({ "semantically similar paragraph": 0.95 }),
    });

    const result = await retrieveResourceChunks(baseInput);

    // The orthogonal chunk never reaches the reranker: its similarity (0) is
    // below the semantic threshold (0.5).
    expect(result).toEqual([
      {
        id: C1_UUID,
        content: "semantically similar paragraph",
        resourceTitle: "Resource A",
        resourceUrl: "https://example.com/a",
      },
    ]);

    expect(embeddingRequests(scenario)[0]?.body).toEqual({
      model: "embedding-default",
      input: ["test query"],
      dimensions: EMBEDDING_DIMENSIONS,
      task_type: "RETRIEVAL_QUERY",
    });
    expect(rerankRequests(scenario)[0]?.body).toEqual({
      model: "rerank-default",
      query: "rewritten query",
      documents: ["semantically similar paragraph"],
      top_n: 5,
    });
  });

  it("uses the embedding vector from the gateway response for the semantic search", async () => {
    await seedUserAndProject();
    await seedResource({ id: R1_UUID, title: "Resource A" });
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "semantically similar paragraph",
    });

    // The response carries a vector orthogonal to the seeded chunk: parsing it
    // (rather than assuming an "always similar" embedding) filters the chunk out.
    const scenario = await gateway.use({
      embeddings: embeddingsReturning(ORTHOGONAL_VECTOR),
      rerank: rankingByContent({ "semantically similar paragraph": 0.95 }),
    });

    const result = await retrieveResourceChunks(baseInput);

    expect(result).toEqual([]);
    expect(rerankRequests(scenario)[0]?.body).toMatchObject({ documents: [] });
  });

  it("normalises escaped newlines in every query before embedding it", async () => {
    await seedUserAndProject();

    const scenario = await gateway.use({
      embeddings: embeddingsReturning(),
      rerank: rankingByContent({}),
    });

    await retrieveResourceChunks({
      ...baseInput,
      multiHopQueries: ["first page\\nsecond page", "third hop"],
    });

    expect(embeddingRequests(scenario)[0]?.body).toMatchObject({
      input: ["first page second page", "third hop"],
    });
  });

  it("returns a keyword-only hit whose vector similarity is below the threshold", async () => {
    await seedUserAndProject();
    await seedResource({ id: R1_UUID, title: "Resource A" });
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "keyword test paragraph",
      vector: ORTHOGONAL_VECTOR,
    });

    const scenario = await gateway.use({
      embeddings: embeddingsReturning(),
      rerank: rankingByContent({ "keyword test paragraph": 0.95 }),
    });

    const result = await retrieveResourceChunks(baseInput);

    expect(result.map((chunk) => chunk.id)).toEqual([C1_UUID]);
    expect(rerankRequests(scenario)[0]?.body).toMatchObject({
      documents: ["keyword test paragraph"],
    });
  });

  it("deduplicates chunks found by both searches before reranking", async () => {
    await seedUserAndProject();
    await seedResource({ id: R1_UUID, title: "Resource A" });
    // Matches the vector search AND the keyword search for "test | query".
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "test query paragraph",
    });

    const scenario = await gateway.use({
      embeddings: embeddingsReturning(),
      rerank: rankingByContent({ "test query paragraph": 0.95 }),
    });

    const result = await retrieveResourceChunks(baseInput);

    expect(result.map((chunk) => chunk.id)).toEqual([C1_UUID]);
    expect(rerankRequests(scenario)[0]?.body).toMatchObject({
      documents: ["test query paragraph"],
    });
  });

  it("only searches the requesting user's resources", async () => {
    await seedUserAndProject();
    await seedResource({
      id: R1_UUID,
      title: "Other user's resource",
      userId: OTHER_USER_ID,
    });
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "test query paragraph",
    });

    const scenario = await gateway.use({
      embeddings: embeddingsReturning(),
      rerank: rankingByContent({ "test query paragraph": 0.95 }),
    });

    const result = await retrieveResourceChunks(baseInput);

    expect(result).toEqual([]);
    expect(rerankRequests(scenario)[0]?.body).toMatchObject({ documents: [] });
  });

  it("scopes the search to the project's resources when a projectId is given", async () => {
    await seedUserAndProject();
    // Project-owned resource (no owner of its own), linked to the project.
    await seedResource({ id: R2_UUID, title: "Project resource", userId: null });
    await linkResourceToProject(R2_UUID);
    await seedChunk({
      resourceId: R2_UUID,
      id: C2_UUID,
      content: "project scoped paragraph",
    });
    // The user's own resource, not linked to the project.
    await seedResource({ id: R1_UUID, title: "User resource" });
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "user scoped paragraph",
    });

    const scenario = await gateway.use({
      embeddings: embeddingsReturning(),
      rerank: rankingByContent({
        "project scoped paragraph": 0.95,
        "user scoped paragraph": 0.9,
      }),
    });

    const result = await retrieveResourceChunks({
      ...baseInput,
      projectId: PROJECT_ID,
    });

    expect(result.map((chunk) => chunk.id)).toEqual([C2_UUID]);
    expect(rerankRequests(scenario)[0]?.body).toMatchObject({
      documents: ["project scoped paragraph"],
    });
  });

  it("excludes the chunks of previously retrieved resources", async () => {
    await seedUserAndProject();
    await seedResource({ id: R1_UUID, title: "Resource A" });
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "already retrieved paragraph",
    });
    await seedChunk({
      resourceId: R1_UUID,
      id: C2_UUID,
      content: "fresh paragraph",
      position: 1,
    });

    const scenario = await gateway.use({
      embeddings: embeddingsReturning(),
      rerank: rankingByContent({
        "already retrieved paragraph": 0.95,
        "fresh paragraph": 0.9,
      }),
    });

    const result = await retrieveResourceChunks({
      ...baseInput,
      previousResources: [C1_UUID],
    });

    expect(result.map((chunk) => chunk.id)).toEqual([C2_UUID]);
    expect(rerankRequests(scenario)[0]?.body).toMatchObject({
      documents: ["fresh paragraph"],
    });
  });

  it("orders the chunks of different resources by the rerank ranking", async () => {
    await seedUserAndProject();
    await seedResource({ id: R1_UUID, title: "Resource A" });
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "lower ranked paragraph",
    });
    await seedResource({ id: R2_UUID, title: "Resource B" });
    await seedChunk({
      resourceId: R2_UUID,
      id: C2_UUID,
      content: "higher ranked paragraph",
    });

    await gateway.use({
      embeddings: embeddingsReturning(),
      rerank: rankingByContent({
        "lower ranked paragraph": 0.85,
        "higher ranked paragraph": 0.95,
      }),
    });

    const result = await retrieveResourceChunks(baseInput);

    expect(result.map((chunk) => chunk.id)).toEqual([C2_UUID, C1_UUID]);
  });

  it("orders the chunks of the same resource by document position, not by ranking", async () => {
    await seedUserAndProject();
    await seedResource({ id: R1_UUID, title: "Resource A" });
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "second section",
      position: 2,
    });
    await seedChunk({
      resourceId: R1_UUID,
      id: C2_UUID,
      content: "first section",
      position: 1,
    });

    await gateway.use({
      embeddings: embeddingsReturning(),
      rerank: rankingByContent({
        "second section": 0.95,
        "first section": 0.9,
      }),
    });

    const result = await retrieveResourceChunks(baseInput);

    expect(result.map((chunk) => chunk.id)).toEqual([C2_UUID, C1_UUID]);
  });

  it("selects the ranked chunks down to the first result below the minimum score", async () => {
    await seedUserAndProject();
    await seedResource({ id: R1_UUID, title: "Resource A" });
    await seedChunk({ resourceId: R1_UUID, id: C1_UUID, content: "alpha" });
    await seedChunk({
      resourceId: R1_UUID,
      id: C2_UUID,
      content: "beta",
      position: 1,
    });
    await seedChunk({
      resourceId: R1_UUID,
      id: C3_UUID,
      content: "gamma",
      position: 2,
    });

    await gateway.use({
      embeddings: embeddingsReturning(),
      // Non-monotonic on purpose: selection stops at the first result below the
      // 0.8 minimum, so "gamma" is dropped even though it scores above it.
      rerank: (request) =>
        rerankResponse(request, {
          results: [
            { index: indexOfDocument(request, "alpha"), relevance_score: 0.95 },
            { index: indexOfDocument(request, "beta"), relevance_score: 0.7 },
            { index: indexOfDocument(request, "gamma"), relevance_score: 0.9 },
          ],
        }),
    });

    const result = await retrieveResourceChunks(baseInput);

    expect(result.map((chunk) => chunk.id)).toEqual([C1_UUID]);
  });

  it("returns no chunks when the gateway answers with an empty ranking", async () => {
    await seedUserAndProject();
    await seedResource({ id: R1_UUID, title: "Resource A" });
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "candidate paragraph",
    });

    // `results: []` is the Gateway default (hybrid search behaves as pure vector
    // search with no rerank): the candidate is discarded, nothing is guessed.
    const scenario = await gateway.use({
      embeddings: embeddingsReturning(),
      rerank: (request) => rerankResponse(request),
    });

    const result = await retrieveResourceChunks(baseInput);

    expect(result).toEqual([]);
    expect(rerankRequests(scenario)[0]?.body).toMatchObject({
      documents: ["candidate paragraph"],
    });
  });

  it("treats a rerank response without results as an empty ranking", async () => {
    await seedUserAndProject();
    await seedResource({ id: R1_UUID, title: "Resource A" });
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "candidate paragraph",
    });

    await gateway.use({
      embeddings: embeddingsReturning(),
      rerank: () => ({ body: { model: "rerank-default" } }),
    });

    await expect(retrieveResourceChunks(baseInput)).resolves.toEqual([]);
  });

  it("returns no chunks when the reranker fails, keeping the search usable", async () => {
    await seedUserAndProject();
    await seedResource({ id: R1_UUID, title: "Resource A" });
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "candidate paragraph",
    });

    await gateway.use({
      embeddings: embeddingsReturning(),
      rerank: () => ({
        status: 500,
        body: { error: { message: "rerank backend down" } },
      }),
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(retrieveResourceChunks(baseInput)).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      "Error reranking documents:",
      expect.any(Error),
    );
  });

  it("propagates an embeddings failure instead of returning partial results", async () => {
    await seedUserAndProject();

    const scenario = await gateway.use({
      embeddings: () => ({
        status: 500,
        body: { error: { message: "embedding backend down" } },
      }),
      rerank: rankingByContent({}),
    });

    await expect(retrieveResourceChunks(baseInput)).rejects.toThrow(
      /Embedding request failed: 500/,
    );
    expect(rerankRequests(scenario)).toHaveLength(0);
  });

  it("fails when the ranking references a chunk that was not sent", async () => {
    await seedUserAndProject();
    await seedResource({ id: R1_UUID, title: "Resource A" });
    await seedChunk({
      resourceId: R1_UUID,
      id: C1_UUID,
      content: "candidate paragraph",
    });

    await gateway.use({
      embeddings: embeddingsReturning(),
      // Out-of-range index, preserved behaviour: the association is taken
      // literally, so the missing chunk surfaces as a TypeError after the
      // rerank `try`/`catch` (it is not silently dropped).
      rerank: (request) =>
        rerankResponse(request, {
          results: [{ index: 7, relevance_score: 0.95 }],
        }),
    });

    await expect(retrieveResourceChunks(baseInput)).rejects.toBeInstanceOf(
      TypeError,
    );
  });
});
