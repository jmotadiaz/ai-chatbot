/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { schema, setDb, getDb } from "@/lib/infrastructure/db/db";
import { compactionDbAdapter } from "@/lib/features/compaction/adapters/db-adapter";
import { user, project, chat, message, chatSummary } from "@/lib/infrastructure/db/schema";

// Helper to run all Drizzle SQL migrations in alphabetical order
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

describe("Compaction Queries - Database Integration Tests with PGlite", () => {
  let testUserId: string;
  let testProjectId: string;
  let testChatId: string;
  let testMessageId: string;

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

    // 4. Seed User, Project, Chat, and Message to satisfy foreign keys
    const [seededUser] = await db.insert(user).values({
      email: "compaction-tester@example.com",
    }).returning();
    testUserId = seededUser.id;

    const [seededProject] = await db.insert(project).values({
      userId: testUserId,
      name: "Compaction Integration Test Project",
      systemPrompt: "You are a helpful compaction assistant.",
    }).returning();
    testProjectId = seededProject.id;

    const [seededChat] = await db.insert(chat).values({
      userId: testUserId,
      projectId: testProjectId,
      title: "Chat for Compaction",
      agent: "context7",
    }).returning();
    testChatId = seededChat.id;

    const [seededMessage] = await db.insert(message).values({
      chatId: testChatId,
      role: "user",
      parts: [{ type: "text", text: "Please compact our conversation history." }],
    }).returning();
    testMessageId = seededMessage.id;
  });

  it("Happy Path: should manage chat summaries and retrieve compaction messages successfully", async () => {
    const db = getDb();

    // 1. Save Chat Summary (saveSummary returns a curried transaction-based query)
    const summaryRecord = await compactionDbAdapter.saveSummary({
      chatId: testChatId,
      messageId: testMessageId,
      summary: "User requested conversation compaction to improve context tokens.",
      tokensBefore: 250,
      modelUsed: "gpt-4o",
    })(db as any);

    expect(summaryRecord).toBeDefined();
    expect(summaryRecord.id).toBeDefined();
    expect(summaryRecord.summary).toContain("requested conversation compaction");

    // 2. Retrieve Latest Summary
    const latestSummary = await compactionDbAdapter.getLatestSummary(testChatId);
    expect(latestSummary).toBeDefined();
    expect(latestSummary?.id).toBe(summaryRecord.id);
    expect(latestSummary?.summary).toBe("User requested conversation compaction to improve context tokens.");

    // 3. Retrieve Message by ID
    const msgRecord = await compactionDbAdapter.getMessageById(testMessageId);
    expect(msgRecord).toBeDefined();
    expect(msgRecord?.id).toBe(testMessageId);
    expect(msgRecord?.role).toBe("user");

    // 4. Retrieve Messages list by Chat ID
    const messages = await compactionDbAdapter.getMessagesByChatId(testChatId);
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(testMessageId);

    // 5. Verify Transaction wrapper runs successfully
    const txResult: any = await compactionDbAdapter.transaction(async (tx: any) => {
      const latest = await tx.select().from(chatSummary).where(eq(chatSummary.chatId, testChatId)).limit(1);
      return latest[0];
    });
    expect(txResult).toBeDefined();
    expect(txResult[0].id).toBe(summaryRecord.id);
  });
});
