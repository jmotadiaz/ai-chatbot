import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  makeIngestUrlResource,
  makeIngestMarkdownResource,
} from "../../../lib/features/rag/ingestion/factory";
import type {
  RagIngestionDbPort,
  RagIngestionAiPort,
} from "../../../lib/features/rag/ingestion/ports";
import type {
  InsertChunk,
  InsertEmbedding,
} from "../../../lib/infrastructure/db/schema";

// ─── MSW Server ───────────────────────────────────────────────────────────────

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ─── Test Infrastructure ─────────────────────────────────────────────────────

interface FakeStore {
  resource: {
    id: string;
    title: string;
    url?: string | null;
    userId?: string | null;
    projectId?: string;
  } | null;
  chunks: InsertChunk[];
  embeddings: InsertEmbedding[];
}

const FAKE_RESOURCE_ID = "fake-resource-id";

function createFakeDbPort(): { port: RagIngestionDbPort; store: FakeStore } {
  const store: FakeStore = { resource: null, chunks: [], embeddings: [] };

  const port: RagIngestionDbPort = {
    transaction: async (fn) => {
      const result = await fn({} as unknown);
      return [result];
    },
    saveResource: (data) => async () => {
      store.resource = { id: FAKE_RESOURCE_ID, ...data };
      return { id: FAKE_RESOURCE_ID };
    },
    saveChunks: (data) => async () => {
      store.chunks.push(...data);
    },
    createEmbeddings: (data) => async () => {
      store.embeddings.push(...data);
    },
  };

  return { port, store };
}

function createFakeAiPort(): RagIngestionAiPort {
  return {
    generateEmbeddings: async (inputs) =>
      inputs.map((input) => ({
        chunkId: input.chunkId,
        embedding: [0.1, 0.2, 0.3],
      })),
  };
}

const BASE_USER_ID = "user-123";
const BASE_PROJECT_ID = "project-456";
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

// ─── Suite 1: makeIngestUrlResource ──────────────────────────────────────────

describe("makeIngestUrlResource", () => {
  it("extracts content from the HTML and stores at least one chunk", async () => {
    servePage(`
      <html><head><title>My Test Page</title></head>
      <body>
        <h1>Introduction</h1>
        <p>This is a paragraph that should be captured as chunk content.</p>
      </body></html>
    `);

    const { port: db, store } = createFakeDbPort();
    const ai = createFakeAiPort();
    const ingest = makeIngestUrlResource(db, ai);

    const result = await ingest({
      urlResource: { url: MOCK_URL },
      userId: BASE_USER_ID,
    });

    expect(result).toEqual({ success: true });
    expect(store.chunks.length).toBeGreaterThan(0);

    const allContent = store.chunks.map((c) => c.content).join("\n");
    expect(allContent).toContain("paragraph that should be captured");
  });

  it("returns { success: false } and stores nothing when server returns 404", async () => {
    server.use(
      http.get(MOCK_URL, () => new HttpResponse(null, { status: 404 })),
    );

    const { port: db, store } = createFakeDbPort();
    const ai = createFakeAiPort();
    const ingest = makeIngestUrlResource(db, ai);

    const result = await ingest({
      urlResource: { url: MOCK_URL },
      userId: BASE_USER_ID,
    });

    expect(result).toEqual({ success: false });
    expect(store.resource).toBeNull();
    expect(store.chunks).toHaveLength(0);
    expect(store.embeddings).toHaveLength(0);
  });

  it("generates one embedding per child chunk and stores them all", async () => {
    servePage(`
      <html><head><title>Doc</title></head><body>
        <h1>Section A</h1><p>Content for section A with enough text to embed.</p>
      </body></html>
    `);

    const { port: db, store } = createFakeDbPort();
    const ai = createFakeAiPort();
    const ingest = makeIngestUrlResource(db, ai);

    await ingest({ urlResource: { url: MOCK_URL }, userId: BASE_USER_ID });

    expect(store.embeddings.length).toBeGreaterThan(0);
    // Each embedding must have a valid 3-element vector (our fake)
    store.embeddings.forEach((emb) => {
      expect(emb.embedding).toEqual([0.1, 0.2, 0.3]);
    });
  });

  it("saves the resource with the page <title> and original URL", async () => {
    servePage(
      `<html><head><title>My Article</title></head><body><p>Content.</p></body></html>`,
    );

    const { port: db, store } = createFakeDbPort();
    const ingest = makeIngestUrlResource(db, createFakeAiPort());

    await ingest({ urlResource: { url: MOCK_URL }, userId: BASE_USER_ID });

    expect(store.resource?.title).toBe("My Article");
    expect(store.resource?.url).toBe(MOCK_URL);
  });

  it("assigns userId to resource when no projectId provided", async () => {
    servePage(
      `<html><head><title>T</title></head><body><p>Content.</p></body></html>`,
    );

    const { port: db, store } = createFakeDbPort();
    const ingest = makeIngestUrlResource(db, createFakeAiPort());

    await ingest({ urlResource: { url: MOCK_URL }, userId: BASE_USER_ID });

    expect(store.resource?.userId).toBe(BASE_USER_ID);
    expect(store.resource?.projectId).toBeUndefined();
  });

  it("assigns projectId (not userId) to resource when projectId is provided", async () => {
    servePage(
      `<html><head><title>T</title></head><body><p>Content.</p></body></html>`,
    );

    const { port: db, store } = createFakeDbPort();
    const ingest = makeIngestUrlResource(db, createFakeAiPort());

    await ingest({
      urlResource: { url: MOCK_URL },
      userId: BASE_USER_ID,
      projectId: BASE_PROJECT_ID,
    });

    expect(store.resource?.projectId).toBe(BASE_PROJECT_ID);
    expect(store.resource?.userId).toBeUndefined();
  });

  it("all saved chunks reference the resource id returned by saveResource", async () => {
    servePage(`
      <html><head><title>T</title></head>
      <body><h1>A</h1><p>Enough content to produce at least one chunk here.</p></body>
      </html>
    `);

    const { port: db, store } = createFakeDbPort();
    const ingest = makeIngestUrlResource(db, createFakeAiPort());

    await ingest({ urlResource: { url: MOCK_URL }, userId: BASE_USER_ID });

    expect(store.chunks.length).toBeGreaterThan(0);
    store.chunks.forEach((chunk) => {
      expect(chunk.resourceId).toBe(FAKE_RESOURCE_ID);
    });
  });
});

// ─── Suite 2: makeIngestMarkdownResource ─────────────────────────────────────

describe("makeIngestMarkdownResource", () => {
  it("produces chunks from markdown content", async () => {
    const { port: db, store } = createFakeDbPort();
    const ingest = makeIngestMarkdownResource(db, createFakeAiPort());

    const result = await ingest({
      title: "My Guide",
      content:
        "# Introduction\n\nThis is the introductory paragraph with enough content to chunk.",
      userId: BASE_USER_ID,
    });

    expect(result).toEqual({ success: true });
    expect(store.chunks.length).toBeGreaterThan(0);
    const allContent = store.chunks.map((c) => c.content).join("\n");
    expect(allContent).toContain("introductory paragraph");
  });

  it("returns { success: false } and stores nothing when content is empty", async () => {
    const { port: db, store } = createFakeDbPort();
    const ingest = makeIngestMarkdownResource(db, createFakeAiPort());

    const result = await ingest({
      title: "Empty",
      content: "",
      userId: BASE_USER_ID,
    });

    expect(result).toEqual({ success: false });
    expect(store.chunks).toHaveLength(0);
    expect(store.embeddings).toHaveLength(0);
  });

  it("saves resource with url: null", async () => {
    const { port: db, store } = createFakeDbPort();
    const ingest = makeIngestMarkdownResource(db, createFakeAiPort());

    await ingest({
      title: "My Doc",
      content: "# Section\n\nSome content here.",
      userId: BASE_USER_ID,
    });

    expect(store.resource?.url).toBeNull();
  });

  it("assigns userId to resource when no projectId provided", async () => {
    const { port: db, store } = createFakeDbPort();
    const ingest = makeIngestMarkdownResource(db, createFakeAiPort());

    await ingest({
      title: "Doc",
      content: "# Section\n\nSome content here.",
      userId: BASE_USER_ID,
    });

    expect(store.resource?.userId).toBe(BASE_USER_ID);
    expect(store.resource?.projectId).toBeUndefined();
  });

  it("assigns projectId (not userId) when projectId is provided", async () => {
    const { port: db, store } = createFakeDbPort();
    const ingest = makeIngestMarkdownResource(db, createFakeAiPort());

    await ingest({
      title: "Doc",
      content: "# Section\n\nSome content here.",
      userId: BASE_USER_ID,
      projectId: BASE_PROJECT_ID,
    });

    expect(store.resource?.projectId).toBe(BASE_PROJECT_ID);
    expect(store.resource?.userId).toBeUndefined();
  });

  it("all chunks carry the real resourceId after the transaction", async () => {
    const { port: db, store } = createFakeDbPort();
    const ingest = makeIngestMarkdownResource(db, createFakeAiPort());

    await ingest({
      title: "Doc",
      content: "# Section\n\nSome content here.",
      userId: BASE_USER_ID,
    });

    expect(store.chunks.length).toBeGreaterThan(0);
    store.chunks.forEach((chunk) => {
      expect(chunk.resourceId).toBe(FAKE_RESOURCE_ID);
    });
  });

  it("generates an embedding for every child chunk", async () => {
    const { port: db, store } = createFakeDbPort();
    const ingest = makeIngestMarkdownResource(db, createFakeAiPort());

    await ingest({
      title: "Doc",
      content: "# Section\n\nSome content here to generate embeddings from.",
      userId: BASE_USER_ID,
    });

    expect(store.embeddings.length).toBeGreaterThan(0);
    store.embeddings.forEach((emb) => {
      expect(emb.embedding).toEqual([0.1, 0.2, 0.3]);
    });
  });
});
