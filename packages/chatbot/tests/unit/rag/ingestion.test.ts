/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { eq } from "drizzle-orm";
import { EMBEDDING_DIMENSIONS } from "config";
import {
  embeddingsResponse,
  type EmbeddingsRequest,
  type GatewayScenario,
  type RecordedRequest,
} from "@ai-chatbot/model-gateway-testing";
import { setupTestDb } from "../../helpers/db-setup";
import { setupGatewayHarness } from "../../helpers/gateway-harness";
import {
  saveMarkdownResource,
  saveUrlResource,
} from "@/lib/features/rag/ingestion";
import {
  chunk as chunkTable,
  embedding as embeddingTable,
  project as projectTable,
  projectResource as projectResourceTable,
  resource as resourceTable,
  user as userTable,
} from "@/lib/infrastructure/db/schema";

/**
 * RAG ingestion as a social unit test (ADR 0013): PGlite in memory for
 * persistence and MSW at the Model Gateway HTTP seam for the embeddings. The
 * feature is driven through its public surface (`@/lib/features/rag/ingestion`);
 * there is no AI port, adapter or real provider here.
 *
 * Vectors are PREPARED by the test: `preparedVector(index)` is a one-hot marker
 * for the position of the input in the request, never a function of the text.
 * It plays no model and proves nothing about embeddings quality; it makes the
 * chunk ↔ vector association observable after the port's `chunkId` echo is gone.
 *
 * Rate limiting: every batch goes through the process-wide
 * `embeddingRateLimiter` (2000 inputs / 350k estimated tokens per minute). The
 * fixtures below stay far below that budget, so `execute` never waits; the
 * blocking branch is covered by `tests/unit/rag/rate-limiter.test.ts` with an
 * explicit clock instead of an arbitrary sleep.
 */

const gateway = setupGatewayHarness();

const BASE_USER_ID = "11111111-1111-1111-1111-111111111111";
const BASE_PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const MOCK_URL = "https://example.com/doc";

/** Explicit prepared vector for the input at `index` (one-hot position marker). */
function preparedVector(index: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  vector[index % EMBEDDING_DIMENSIONS] = index + 1;
  return vector;
}

/** The index encoded by a prepared vector; fails the test for anything else. */
function decodePreparedVector(vector: number[]): number {
  const marked = vector.flatMap((value, position) => (value === 0 ? [] : [position]));
  expect(marked).toHaveLength(1);
  const value = vector[marked[0]!]!;
  return value - 1;
}

const inputsOf = (request: EmbeddingsRequest): string[] =>
  Array.isArray(request.input) ? request.input : [request.input ?? ""];

/** Installs a scenario whose embeddings reply carries prepared vectors per input. */
function useEmbeddingsScenario(
  vectorsOf: (inputs: string[]) => number[][] = (inputs) =>
    inputs.map((_, index) => preparedVector(index)),
): Promise<GatewayScenario> {
  return gateway.use({
    embeddings: (request) =>
      embeddingsResponse(request, {
        dimensions: EMBEDDING_DIMENSIONS,
        vectors: vectorsOf(inputsOf(request)),
      }),
  });
}

const embeddingsRequests = (scenario: GatewayScenario) =>
  scenario.requests.filter(
    (request: RecordedRequest) => request.path === "/v1/embeddings",
  );

/** Every input string that reached the Gateway, in request order. */
const allInputs = (scenario: GatewayScenario): string[] =>
  embeddingsRequests(scenario).flatMap((request) =>
    inputsOf(request.body as EmbeddingsRequest),
  );

function servePage(html: string) {
  gateway.server.use(
    http.get(MOCK_URL, () =>
      HttpResponse.text(html, { headers: { "Content-Type": "text/html" } }),
    ),
  );
}

const LONG_PARAGRAPH =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(90);

/**
 * Markdown with `sections` heading-delimited blocks of ~5.2k characters. Each
 * block is big enough to become its own parent chunk (MIN_PARENT_SIZE) and small
 * enough not to be split as oversized (PARENT_CHUNK_SIZE), so the number of
 * parents — and the resulting batching — is predictable.
 */
const longDocument = (sections: number) =>
  Array.from(
    { length: sections },
    (_, index) => `## Section ${index}\n\n${LONG_PARAGRAPH}\n`,
  ).join("\n");

const PAGE_HTML = `
  <html><head><title>My Test Page</title></head>
  <body>
    <h1>Introduction</h1>
    <p>This is a paragraph that should be captured as chunk content.</p>
  </body></html>
`;

describe("RAG ingestion", () => {
  let db: any;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  afterEach(async () => {
    // Scoped cleanup of this file's own rows (dedicated in-memory PGlite).
    await db.delete(embeddingTable);
    await db.delete(chunkTable);
    await db.delete(resourceTable);
    await db.delete(projectTable);
    await db.delete(userTable);
  });

  async function seedUserAndProject() {
    await db.insert(userTable).values({
      id: BASE_USER_ID,
      email: "ingestion-tester@example.com",
    });

    await db.insert(projectTable).values({
      id: BASE_PROJECT_ID,
      userId: BASE_USER_ID,
      name: "Test Project",
      systemPrompt: "System prompt",
    });
  }

  /** Persisted embedding rows joined with the chunk they belong to. */
  async function savedEmbeddingRows(): Promise<
    { chunkId: string; embedding: number[]; position: number }[]
  > {
    return db
      .select({
        chunkId: embeddingTable.chunkId,
        embedding: embeddingTable.embedding,
        position: chunkTable.position,
      })
      .from(embeddingTable)
      .innerJoin(chunkTable, eq(embeddingTable.chunkId, chunkTable.id));
  }

  describe("saveUrlResource", () => {
    it("extracts the page content and persists chunks with title and URL", async () => {
      servePage(PAGE_HTML);
      await seedUserAndProject();
      await useEmbeddingsScenario();

      const result = await saveUrlResource({
        urlResource: { url: MOCK_URL },
        userId: BASE_USER_ID,
      });

      expect(result).toEqual({ success: true });

      const savedChunks = await db.select().from(chunkTable);
      expect(savedChunks.length).toBeGreaterThan(0);
      expect(savedChunks.map((c: any) => c.content).join("\n")).toContain(
        "paragraph that should be captured",
      );

      const savedResources = await db.select().from(resourceTable);
      expect(savedResources).toHaveLength(1);
      expect(savedResources[0].title).toBe("My Test Page");
      expect(savedResources[0].url).toBe(MOCK_URL);
      savedChunks.forEach((chunk: any) => {
        expect(chunk.resourceId).toBe(savedResources[0].id);
      });
    });

    it("requests `embedding-default`/RETRIEVAL_DOCUMENT and stores the prepared vectors", async () => {
      servePage(PAGE_HTML);
      await seedUserAndProject();
      const scenario = await useEmbeddingsScenario();

      await saveUrlResource({
        urlResource: { url: MOCK_URL },
        userId: BASE_USER_ID,
      });

      const requests = embeddingsRequests(scenario);
      expect(requests).toHaveLength(1);
      const body = requests[0]!.body as {
        model: string;
        dimensions: number;
        task_type: string;
        input: string[];
      };
      expect(body.model).toBe("embedding-default");
      expect(body.dimensions).toBe(EMBEDDING_DIMENSIONS);
      expect(body.task_type).toBe("RETRIEVAL_DOCUMENT");
      expect(body.input.length).toBeGreaterThan(0);
      body.input.forEach((input) => {
        expect(typeof input).toBe("string");
        expect(input.length).toBeGreaterThan(0);
      });

      const rows = await savedEmbeddingRows();
      // One embedding row per child chunk that went over HTTP, and every chunk
      // (parent) has at least one embedding of its own.
      expect(rows).toHaveLength(body.input.length);
      const chunkIds = new Set<string>(
        (await db.select().from(chunkTable)).map((c: any) => c.id),
      );
      rows.forEach((row) => expect(chunkIds.has(row.chunkId)).toBe(true));
      expect(new Set(rows.map((row) => row.chunkId)).size).toBe(chunkIds.size);

      // Each stored vector is exactly one of the prepared vectors.
      expect(
        rows.map((row) => decodePreparedVector(row.embedding)).sort((a, b) => a - b),
      ).toEqual(Array.from({ length: body.input.length }, (_, index) => index));
    });

    it("keeps every chunk associated with the prepared vectors of its own inputs", async () => {
      await seedUserAndProject();
      const scenario = await useEmbeddingsScenario();

      const markdown = longDocument(3);
      const result = await saveMarkdownResource({
        title: "Long Doc",
        content: markdown,
        userId: BASE_USER_ID,
      });

      expect(result).toEqual({ success: true });

      const inputs = allInputs(scenario);
      const savedChunks = await db.select().from(chunkTable);
      // The fixture produces several parent chunks, each with several children.
      expect(savedChunks.length).toBeGreaterThan(1);
      expect(inputs.length).toBeGreaterThan(savedChunks.length);

      const rows = await savedEmbeddingRows();
      expect(rows).toHaveLength(inputs.length);

      const positionOf = new Map<string, number>(
        savedChunks.map((chunk: any) => [chunk.id, chunk.position]),
      );
      const indicesByChunk = new Map<string, number[]>();
      for (const row of rows) {
        const indices = indicesByChunk.get(row.chunkId) ?? [];
        indices.push(decodePreparedVector(row.embedding));
        indicesByChunk.set(row.chunkId, indices);
      }

      expect(indicesByChunk.size).toBe(savedChunks.length);

      // Grouping by parent chunk reproduces the ingestion order: each chunk owns
      // a contiguous run of inputs, and the runs partition 0..N-1 in position
      // order (input order within the batch is preserved by the feature).
      const groups = [...indicesByChunk.entries()].sort(
        (a, b) => (positionOf.get(a[0]) ?? 0) - (positionOf.get(b[0]) ?? 0),
      );
      const flattened: number[] = [];
      for (const [, indices] of groups) {
        const sorted = [...indices].sort((a, b) => a - b);
        expect(sorted[0]).toBe(flattened.length);
        sorted.forEach((value, offset) => expect(value).toBe(sorted[0]! + offset));
        flattened.push(...sorted);
      }
      expect(flattened).toEqual(Array.from({ length: inputs.length }, (_, index) => index));
    });

    it("batches the embedding requests at 99 inputs", async () => {
      await seedUserAndProject();
      const scenario = await useEmbeddingsScenario();

      const result = await saveMarkdownResource({
        title: "Huge Doc",
        content: longDocument(10),
        userId: BASE_USER_ID,
      });

      expect(result).toEqual({ success: true });

      const requests = embeddingsRequests(scenario);
      expect(requests.length).toBeGreaterThan(1);
      const sizes = requests.map((request) =>
        inputsOf(request.body as EmbeddingsRequest).length,
      );
      expect(sizes[0]).toBe(99);
      sizes.slice(0, -1).forEach((size) => expect(size).toBe(99));
      sizes.forEach((size) => expect(size).toBeLessThanOrEqual(99));

      const inputs = allInputs(scenario);
      const rows = await savedEmbeddingRows();
      expect(rows).toHaveLength(inputs.length);
    });

    it("returns { success: false } and stores nothing when the page is unreachable", async () => {
      gateway.server.use(http.get(MOCK_URL, () => new HttpResponse(null, { status: 404 })));
      await seedUserAndProject();
      const scenario = await useEmbeddingsScenario();

      const result = await saveUrlResource({
        urlResource: { url: MOCK_URL },
        userId: BASE_USER_ID,
      });

      expect(result).toEqual({ success: false });
      // Nothing was chunked, so nothing went to the Gateway at all.
      expect(embeddingsRequests(scenario)).toHaveLength(0);
      expect(await db.select().from(resourceTable)).toHaveLength(0);
      expect(await db.select().from(chunkTable)).toHaveLength(0);
      expect(await db.select().from(embeddingTable)).toHaveLength(0);
    });

    it("assigns the resource to the user when no project is given", async () => {
      servePage(`<html><head><title>T</title></head><body><p>Content.</p></body></html>`);
      await seedUserAndProject();
      await useEmbeddingsScenario();

      await saveUrlResource({ urlResource: { url: MOCK_URL }, userId: BASE_USER_ID });

      const savedResources = await db.select().from(resourceTable);
      expect(savedResources).toHaveLength(1);
      expect(savedResources[0].userId).toBe(BASE_USER_ID);
      expect(await db.select().from(projectResourceTable)).toHaveLength(0);
    });

    it("assigns the resource to the project and links it to that project", async () => {
      servePage(`<html><head><title>T</title></head><body><p>Content.</p></body></html>`);
      await seedUserAndProject();
      await useEmbeddingsScenario();

      await saveUrlResource({
        urlResource: { url: MOCK_URL },
        userId: BASE_USER_ID,
        projectId: BASE_PROJECT_ID,
      });

      const savedResources = await db.select().from(resourceTable);
      expect(savedResources).toHaveLength(1);
      const links = await db.select().from(projectResourceTable);
      expect(links).toHaveLength(1);
      expect(links[0].projectId).toBe(BASE_PROJECT_ID);
      expect(links[0].resourceId).toBe(savedResources[0].id);
    });

    it("propagates a failed embedding request without persisting anything", async () => {
      servePage(PAGE_HTML);
      await seedUserAndProject();
      const scenario = await gateway.use({
        embeddings: () => ({
          status: 500,
          body: { error: { message: "upstream exploded" } },
        }),
      });

      await expect(
        saveUrlResource({ urlResource: { url: MOCK_URL }, userId: BASE_USER_ID }),
      ).rejects.toThrow(/Embedding request failed: 500/);

      // Embeddings run before the transaction: nothing is written.
      expect(embeddingsRequests(scenario)).toHaveLength(1);
      expect(await db.select().from(resourceTable)).toHaveLength(0);
      expect(await db.select().from(chunkTable)).toHaveLength(0);
      expect(await db.select().from(embeddingTable)).toHaveLength(0);
    });

    it("propagates a malformed embedding response without persisting anything", async () => {
      servePage(PAGE_HTML);
      await seedUserAndProject();
      await gateway.use({
        // Valid JSON list, but an entry without the vector itself.
        embeddings: (request) => ({
          body: {
            object: "list",
            data: inputsOf(request).map((_, index) => ({
              object: "embedding",
              index,
            })),
            usage: { prompt_tokens: 10, total_tokens: 10 },
          },
        }),
      });

      await expect(
        saveUrlResource({ urlResource: { url: MOCK_URL }, userId: BASE_USER_ID }),
      ).rejects.toThrow(/missing an embedding vector/);

      expect(await db.select().from(resourceTable)).toHaveLength(0);
      expect(await db.select().from(chunkTable)).toHaveLength(0);
      expect(await db.select().from(embeddingTable)).toHaveLength(0);
    });
  });

  describe("saveMarkdownResource", () => {
    it("chunks and persists markdown content with url: null", async () => {
      await seedUserAndProject();
      const scenario = await useEmbeddingsScenario();

      const result = await saveMarkdownResource({
        title: "My Guide",
        content:
          "# Introduction\n\nThis is the introductory paragraph with enough content to chunk.",
        userId: BASE_USER_ID,
      });

      expect(result).toEqual({ success: true });

      const savedResources = await db.select().from(resourceTable);
      expect(savedResources).toHaveLength(1);
      expect(savedResources[0].url).toBeNull();
      expect(savedResources[0].title).toBe("My Guide");

      const savedChunks = await db.select().from(chunkTable);
      expect(savedChunks.length).toBeGreaterThan(0);
      expect(savedChunks.map((c: any) => c.content).join("\n")).toContain(
        "introductory paragraph",
      );
      savedChunks.forEach((chunk: any) => {
        expect(chunk.resourceId).toBe(savedResources[0].id);
      });

      const rows = await savedEmbeddingRows();
      expect(rows).toHaveLength(allInputs(scenario).length);
      expect(rows.length).toBeGreaterThanOrEqual(savedChunks.length);
    });

    it("makes no embedding request when there is nothing to ingest", async () => {
      await seedUserAndProject();
      const scenario = await useEmbeddingsScenario();

      const result = await saveMarkdownResource({
        title: "Empty",
        content: "",
        userId: BASE_USER_ID,
      });

      expect(result).toEqual({ success: false });
      // No work, no traffic: not even a POST leaves the process.
      expect(scenario.requests.filter((request) => request.method === "POST")).toHaveLength(0);
      expect(await db.select().from(resourceTable)).toHaveLength(0);
      expect(await db.select().from(chunkTable)).toHaveLength(0);
      expect(await db.select().from(embeddingTable)).toHaveLength(0);
    });

    it("assigns the resource to the user when no project is given", async () => {
      await seedUserAndProject();
      await useEmbeddingsScenario();

      await saveMarkdownResource({
        title: "Doc",
        content: "# Section\n\nSome content here.",
        userId: BASE_USER_ID,
      });

      const savedResources = await db.select().from(resourceTable);
      expect(savedResources).toHaveLength(1);
      expect(savedResources[0].userId).toBe(BASE_USER_ID);
      expect(await db.select().from(projectResourceTable)).toHaveLength(0);
    });

    it("assigns the resource to the project when a projectId is given", async () => {
      await seedUserAndProject();
      await useEmbeddingsScenario();

      await saveMarkdownResource({
        title: "Doc",
        content: "# Section\n\nSome content here.",
        userId: BASE_USER_ID,
        projectId: BASE_PROJECT_ID,
      });

      const savedResources = await db.select().from(resourceTable);
      expect(savedResources).toHaveLength(1);
      const links = await db.select().from(projectResourceTable);
      expect(links).toHaveLength(1);
      expect(links[0].projectId).toBe(BASE_PROJECT_ID);
      expect(links[0].resourceId).toBe(savedResources[0].id);
    });
  });
});
