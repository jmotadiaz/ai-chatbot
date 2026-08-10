/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  makeIngestUrlResource,
  makeIngestMarkdownResource,
} from "../../../lib/features/rag/ingestion/factory";
import type { RagIngestionAiPort } from "../../../lib/features/rag/ingestion/ports";
import { setupTestDb } from "../../helpers/db-setup";
import { resource as resourceTable, chunk as chunkTable, embedding as embeddingTable, user as userTable, project as projectTable, projectResource as projectResourceTable } from "@/lib/infrastructure/db/schema";

// ─── MSW Server ───────────────────────────────────────────────────────────────

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ─── Test Infrastructure ─────────────────────────────────────────────────────

function createFakeAiPort(): RagIngestionAiPort {
  return {
    generateEmbeddings: async (inputs) =>
      inputs.map((input) => ({
        chunkId: input.chunkId,
        embedding: Array(768).fill(0.1),
      })),
  };
}

const BASE_USER_ID = "11111111-1111-1111-1111-111111111111";
const BASE_PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const MOCK_URL = "https://example.com/doc";

function servePage(html: string) {
  server.use(
    http.get(MOCK_URL, () =>
      HttpResponse.text(html, {
        headers: { "Content-Type": "text/html" },
      }),
    ),
  );
}

describe("RAG ingestion integration", () => {
  let db: any;

  beforeAll(async () => {
    // Spin up PGlite and set it globally
    db = await setupTestDb();
  });

  afterEach(async () => {
    // Clear tables between tests to keep them isolated
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

  describe("makeIngestUrlResource", () => {
    it("extracts content from the HTML and stores at least one chunk", async () => {
      servePage(`
        <html><head><title>My Test Page</title></head>
        <body>
          <h1>Introduction</h1>
          <p>This is a paragraph that should be captured as chunk content.</p>
        </body></html>
      `);

      await seedUserAndProject();

      const ai = createFakeAiPort();
      const ingest = makeIngestUrlResource(ai);

      const result = await ingest({
        urlResource: { url: MOCK_URL },
        userId: BASE_USER_ID,
      });

      expect(result).toEqual({ success: true });

      // Fetch saved chunks from the real database!
      const savedChunks = await db.select().from(chunkTable);
      expect(savedChunks.length).toBeGreaterThan(0);

      const allContent = savedChunks.map((c: any) => c.content).join("\n");
      expect(allContent).toContain("paragraph that should be captured");
    });

    it("returns { success: false } and stores nothing when server returns 404", async () => {
      server.use(
        http.get(MOCK_URL, () => new HttpResponse(null, { status: 404 })),
      );

      await seedUserAndProject();

      const ai = createFakeAiPort();
      const ingest = makeIngestUrlResource(ai);

      const result = await ingest({
        urlResource: { url: MOCK_URL },
        userId: BASE_USER_ID,
      });

      expect(result).toEqual({ success: false });

      const savedResources = await db.select().from(resourceTable);
      const savedChunks = await db.select().from(chunkTable);
      const savedEmbeddings = await db.select().from(embeddingTable);

      expect(savedResources).toHaveLength(0);
      expect(savedChunks).toHaveLength(0);
      expect(savedEmbeddings).toHaveLength(0);
    });

    it("generates one embedding per child chunk and stores them all", async () => {
      servePage(`
        <html><head><title>Doc</title></head><body>
          <h1>Section A</h1><p>Content for section A with enough text to embed.</p>
        </body></html>
      `);

      await seedUserAndProject();

      const ai = createFakeAiPort();
      const ingest = makeIngestUrlResource(ai);

      await ingest({ urlResource: { url: MOCK_URL }, userId: BASE_USER_ID });

      const savedEmbeddings = await db.select().from(embeddingTable);
      expect(savedEmbeddings.length).toBeGreaterThan(0);
      // Each embedding must have a valid 3-element vector (our fake)
      savedEmbeddings.forEach((emb: any) => {
        expect(emb.embedding).toEqual(Array(768).fill(0.1));
      });
    });

    it("saves the resource with the page <title> and original URL", async () => {
      servePage(
        `<html><head><title>My Article</title></head><body><p>Content.</p></body></html>`,
      );

      await seedUserAndProject();

      const ingest = makeIngestUrlResource(createFakeAiPort());

      await ingest({ urlResource: { url: MOCK_URL }, userId: BASE_USER_ID });

      const savedResources = await db.select().from(resourceTable);
      expect(savedResources).toHaveLength(1);
      expect(savedResources[0].title).toBe("My Article");
      expect(savedResources[0].url).toBe(MOCK_URL);
    });

    it("assigns userId to resource when no projectId provided", async () => {
      servePage(
        `<html><head><title>T</title></head><body><p>Content.</p></body></html>`,
      );

      await seedUserAndProject();

      const ingest = makeIngestUrlResource(createFakeAiPort());

      await ingest({ urlResource: { url: MOCK_URL }, userId: BASE_USER_ID });

      const savedResources = await db.select().from(resourceTable);
      expect(savedResources).toHaveLength(1);
      expect(savedResources[0].userId).toBe(BASE_USER_ID);
      const savedProjectResources = await db.select().from(projectResourceTable);
      expect(savedProjectResources).toHaveLength(0);
    });

    it("assigns projectId (not userId) to resource when projectId is provided", async () => {
      servePage(
        `<html><head><title>T</title></head><body><p>Content.</p></body></html>`,
      );

      await seedUserAndProject();

      const ingest = makeIngestUrlResource(createFakeAiPort());

      await ingest({
        urlResource: { url: MOCK_URL },
        userId: BASE_USER_ID,
        projectId: BASE_PROJECT_ID,
      });

      const savedResources = await db.select().from(resourceTable);
      expect(savedResources).toHaveLength(1);
      const savedProjectResources = await db.select().from(projectResourceTable);
      expect(savedProjectResources).toHaveLength(1);
      expect(savedProjectResources[0].projectId).toBe(BASE_PROJECT_ID);
      expect(savedProjectResources[0].resourceId).toBe(savedResources[0].id);
    });

    it("all saved chunks reference the resource id returned by saveResource", async () => {
      servePage(`
        <html><head><title>T</title></head>
        <body><h1>A</h1><p>Enough content to produce at least one chunk here.</p></body>
        </html>
      `);

      await seedUserAndProject();

      const ingest = makeIngestUrlResource(createFakeAiPort());

      await ingest({ urlResource: { url: MOCK_URL }, userId: BASE_USER_ID });

      const savedResources = await db.select().from(resourceTable);
      const savedChunks = await db.select().from(chunkTable);

      expect(savedResources).toHaveLength(1);
      expect(savedChunks.length).toBeGreaterThan(0);
      savedChunks.forEach((chunk: any) => {
        expect(chunk.resourceId).toBe(savedResources[0].id);
      });
    });
  });

  describe("makeIngestMarkdownResource", () => {
    it("produces chunks from markdown content", async () => {
      await seedUserAndProject();

      const ingest = makeIngestMarkdownResource(createFakeAiPort());

      const result = await ingest({
        title: "My Guide",
        content:
          "# Introduction\n\nThis is the introductory paragraph with enough content to chunk.",
        userId: BASE_USER_ID,
      });

      expect(result).toEqual({ success: true });

      const savedChunks = await db.select().from(chunkTable);
      expect(savedChunks.length).toBeGreaterThan(0);
      const allContent = savedChunks.map((c: any) => c.content).join("\n");
      expect(allContent).toContain("introductory paragraph");
    });

    it("returns { success: false } and stores nothing when content is empty", async () => {
      await seedUserAndProject();

      const ingest = makeIngestMarkdownResource(createFakeAiPort());

      const result = await ingest({
        title: "Empty",
        content: "",
        userId: BASE_USER_ID,
      });

      expect(result).toEqual({ success: false });

      const savedChunks = await db.select().from(chunkTable);
      const savedEmbeddings = await db.select().from(embeddingTable);

      expect(savedChunks).toHaveLength(0);
      expect(savedEmbeddings).toHaveLength(0);
    });

    it("saves resource with url: null", async () => {
      await seedUserAndProject();

      const ingest = makeIngestMarkdownResource(createFakeAiPort());

      await ingest({
        title: "My Doc",
        content: "# Section\n\nSome content here.",
        userId: BASE_USER_ID,
      });

      const savedResources = await db.select().from(resourceTable);
      expect(savedResources).toHaveLength(1);
      expect(savedResources[0].url).toBeNull();
    });

    it("assigns userId to resource when no projectId provided", async () => {
      await seedUserAndProject();

      const ingest = makeIngestMarkdownResource(createFakeAiPort());

      await ingest({
        title: "Doc",
        content: "# Section\n\nSome content here.",
        userId: BASE_USER_ID,
      });

      const savedResources = await db.select().from(resourceTable);
      expect(savedResources).toHaveLength(1);
      expect(savedResources[0].userId).toBe(BASE_USER_ID);
      const savedProjectResources = await db.select().from(projectResourceTable);
      expect(savedProjectResources).toHaveLength(0);
    });

    it("assigns projectId (not userId) when projectId is provided", async () => {
      await seedUserAndProject();

      const ingest = makeIngestMarkdownResource(createFakeAiPort());

      await ingest({
        title: "Doc",
        content: "# Section\n\nSome content here.",
        userId: BASE_USER_ID,
        projectId: BASE_PROJECT_ID,
      });

      const savedResources = await db.select().from(resourceTable);
      expect(savedResources).toHaveLength(1);
      const savedProjectResources = await db.select().from(projectResourceTable);
      expect(savedProjectResources).toHaveLength(1);
      expect(savedProjectResources[0].projectId).toBe(BASE_PROJECT_ID);
      expect(savedProjectResources[0].resourceId).toBe(savedResources[0].id);
    });

    it("all chunks carry the real resourceId after the transaction", async () => {
      await seedUserAndProject();

      const ingest = makeIngestMarkdownResource(createFakeAiPort());

      await ingest({
        title: "Doc",
        content: "# Section\n\nSome content here.",
        userId: BASE_USER_ID,
      });

      const savedResources = await db.select().from(resourceTable);
      const savedChunks = await db.select().from(chunkTable);

      expect(savedResources).toHaveLength(1);
      expect(savedChunks.length).toBeGreaterThan(0);
      savedChunks.forEach((chunk: any) => {
        expect(chunk.resourceId).toBe(savedResources[0].id);
      });
    });

    it("generates an embedding for every child chunk", async () => {
      await seedUserAndProject();

      const ingest = makeIngestMarkdownResource(createFakeAiPort());

      await ingest({
        title: "Doc",
        content: "# Section\n\nSome content here to generate embeddings from.",
        userId: BASE_USER_ID,
      });

      const savedEmbeddings = await db.select().from(embeddingTable);
      expect(savedEmbeddings.length).toBeGreaterThan(0);
      savedEmbeddings.forEach((emb: any) => {
        expect(emb.embedding).toEqual(Array(768).fill(0.1));
      });
    });
  });
});
