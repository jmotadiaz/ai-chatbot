/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { schema, setDb, getDb } from "@/lib/infrastructure/db/db";
import {
  saveResource,
  saveChunks,
  createEmbeddings,
  findSimilarChunksBySemantic,
  findSimilarChunksByKeyword,
  addResourceToProject,
  removeResourceFromProject,
  getProjectResourcesPaginated,
  getUserResourcesNotInProject,
  deleteResourceById,
} from "@/lib/features/rag/queries";
import { user, project, chunk, embedding } from "@/lib/infrastructure/db/schema";

// Helper to run all Drizzle SQL migrations in correct alphabetical order
async function runMigrations(pglite: PGlite) {
  const migrationsFolder = path.resolve(process.cwd(), "./lib/infrastructure/db/migrations");
  const files = fs.readdirSync(migrationsFolder)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsFolder, file);
    const sqlContent = fs.readFileSync(filePath, "utf8");
    try {
      await pglite.exec(sqlContent);
    } catch (err) {
      console.error(`❌ Migration failed at: ${file}`, err);
      throw err;
    }
  }
}

describe("RAG Queries - Database Integration Tests with PGlite", () => {
  let testUserId: string;
  let testProjectId: string;

  beforeAll(async () => {
    // 1. Spin up PGlite with pgvector support
    const pglite = await PGlite.create({
      extensions: {
        vector,
      },
    });

    // 2. Run migrations
    await runMigrations(pglite);

    // 3. Setup Drizzle client and set it globally
    const db = drizzle({ client: pglite, schema });
    setDb(db as any);

    // 4. Seed User and Project to satisfy foreign keys
    const [seededUser] = await db.insert(user).values({
      email: "rag-tester@example.com",
    }).returning();
    testUserId = seededUser.id;

    const [seededProject] = await db.insert(project).values({
      userId: testUserId,
      name: "RAG Integration Test Project",
      systemPrompt: "You are a helpful test assistant.",
    }).returning();
    testProjectId = seededProject.id;
  });

  it("Happy Path 1: should ingest resources, chunks, and embeddings successfully", async () => {
    const db = getDb();

    await db.transaction(async (tx: any) => {
      // 1. Save resource
      const res = await saveResource({
        title: "Introduction to RAG",
        url: "https://example.com/rag-intro",
        userId: testUserId,
      })(tx);

      expect(res).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.title).toBe("Introduction to RAG");

      // 2. Save chunks
      const chunks = await saveChunks([
        {
          resourceId: res.id,
          content: "Retrieval-Augmented Generation improves LLMs by retrieving relevant documents.",
          type: "text",
          position: 1,
        },
      ])(tx);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].resourceId).toBe(res.id);

      // 3. Create embeddings (768 dimensions)
      const mockVector = Array(768).fill(0.01);
      const embs = await createEmbeddings([
        {
          chunkId: chunks[0].id,
          embedding: mockVector,
        },
      ])(tx);

      expect(embs).toHaveLength(1);
      expect(embs[0].chunkId).toBe(chunks[0].id);
      expect(embs[0].embedding).toEqual(mockVector);

      tx.rollback();
    }).catch((err) => {
      if (err.message !== "Rollback") throw err;
    });
  });

  it("Happy Path 2: should execute vector semantic searches using pgvector", async () => {
    const db = getDb();

    // 1. Setup two chunks with distinct vector embeddings (768 dimensions)
    const [res] = await db.insert(schema.resource).values({
      title: "Agentic Computing vs Databases",
      userId: testUserId,
    }).returning();

    const [chunkAgentic] = await db.insert(chunk).values({
      resourceId: res.id,
      content: "DeepMind researchers published papers on agentic workflow components.",
      type: "text",
      position: 1,
    }).returning();

    const [chunkDatabase] = await db.insert(chunk).values({
      resourceId: res.id,
      content: "Relational databases use tables, rows, columns, and foreign key constraints.",
      type: "text",
      position: 2,
    }).returning();

    // Vector A: Starts with 1.0 (highly close to agentic query)
    const vectorAgentic = Array(768).fill(0);
    vectorAgentic[0] = 1.0;

    // Vector B: Starts with -1.0 (highly opposite to query)
    const vectorDatabase = Array(768).fill(0);
    vectorDatabase[0] = -1.0;

    await db.insert(embedding).values([
      { chunkId: chunkAgentic.id, embedding: vectorAgentic },
      { chunkId: chunkDatabase.id, embedding: vectorDatabase },
    ]);

    // 2. Perform semantic search querying close to Vector A
    const queryEmbedding = Array(768).fill(0);
    queryEmbedding[0] = 0.95; // Query embedding is very close to vectorAgentic

    const results = await findSimilarChunksBySemantic({
      embeddings: [queryEmbedding],
      userId: testUserId,
      limitByQuery: 5,
      similarityThreshold: 0.1, // Will filter out vectorDatabase (-1.0 similarity)
    });

    // 3. Assertions: Vector A is returned, while Vector B is filtered out
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(chunkAgentic.id);
    expect(results[0].content).toContain("agentic workflow");
    expect(results[0].similarity).toBeGreaterThan(0.9);
  });

  it("Happy Path 3: should execute GIN full-text searches using tsvector keyword search", async () => {
    // Perform search for keyword "database" or "relational"
    const results = await findSimilarChunksByKeyword({
      queries: ["relational database"],
      userId: testUserId,
      limitByQuery: 5,
    });

    // Should match chunkDatabase which contains "Relational databases use tables"
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain("Relational databases use tables");
    expect(results[0].similarity).toBeGreaterThan(0); // rank should be positive
  });

  it("Happy Path 4: should handle project-resource linkages, queries, and paginations", async () => {
    const db = getDb();

    // 1. Create a new resource
    const [res] = await db.insert(schema.resource).values({
      title: "Project-Specific Resource",
      userId: testUserId,
    }).returning();

    // 2. Add resource to project (addResourceToProject is a curried transaction-based query)
    await addResourceToProject({
      projectId: testProjectId,
      resourceId: res.id,
    })(db as any);

    // 3. Query project paginated resources
    const projectRes = await getProjectResourcesPaginated({
      projectId: testProjectId,
      offset: 0,
      limit: 10,
    });

    expect(projectRes.items).toHaveLength(1);
    expect(projectRes.items[0].id).toBe(res.id);
    expect(projectRes.items[0].title).toBe("Project-Specific Resource");

    // 4. Query user resources not in project (should be empty since this resource is in the project)
    const notInProjectRes = await getUserResourcesNotInProject({
      userId: testUserId,
      projectId: testProjectId,
      offset: 0,
      limit: 10,
    });
    // This resource is in the project, so it should not appear here
    const hasLinkedResource = notInProjectRes.items.some((r) => r.id === res.id);
    expect(hasLinkedResource).toBe(false);

    // 5. Remove resource from project (removeResourceFromProject is a curried transaction-based query)
    await removeResourceFromProject({
      projectId: testProjectId,
      resourceId: res.id,
    })(db as any);

    const projectResAfter = await getProjectResourcesPaginated({
      projectId: testProjectId,
      offset: 0,
      limit: 10,
    });
    expect(projectResAfter.items).toHaveLength(0);
  });

  it("Happy Path 5: should cascade delete resource chunks and embeddings when resource is deleted", async () => {
    const db = getDb();

    // 1. Create resource with chunk and embedding
    const [res] = await db.insert(schema.resource).values({
      title: "To Be Deleted",
      userId: testUserId,
    }).returning();

    const [chk] = await db.insert(chunk).values({
      resourceId: res.id,
      content: "This content is transient.",
      type: "text",
    }).returning();

    await db.insert(embedding).values({
      chunkId: chk.id,
      embedding: Array(768).fill(0),
    });

    // 2. Delete resource (deleteResourceById is a curried transaction-based query)
    await deleteResourceById({ resourceId: res.id })(db as any);

    // 3. Verify chunk and embedding are deleted automatically by ON DELETE CASCADE
    const chkCheck = await db.select().from(chunk).where(eq(chunk.id, chk.id));
    expect(chkCheck).toHaveLength(0);

    const embCheck = await db.select().from(embedding).where(eq(embedding.chunkId, chk.id));
    expect(embCheck).toHaveLength(0);
  });
});
