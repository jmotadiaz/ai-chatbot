/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { schema, setDb, getDb } from "@/lib/infrastructure/db/db";
import { chatDbAdapter } from "@/lib/features/chat/conversation/adapters/db-adapter";
import { user, project } from "@/lib/infrastructure/db/schema";

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

describe("Chat Queries - Database Integration Tests with PGlite", () => {
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
      email: "chat-tester@example.com",
    }).returning();
    testUserId = seededUser.id;

    const [seededProject] = await db.insert(project).values({
      userId: testUserId,
      name: "Chat Integration Test Project",
      systemPrompt: "You are a helpful chat assistant.",
    }).returning();
    testProjectId = seededProject.id;
  });

  it("Happy Path: should handle complete chat and message lifecycles successfully", async () => {
    const db = getDb();

    // 1. Save Chat
    const chatRecord = await chatDbAdapter.saveChat({
      userId: testUserId,
      projectId: testProjectId,
      title: "New Conversation",
      agent: "context7",
    })(db as any);

    expect(chatRecord).toBeDefined();
    expect(chatRecord.id).toBeDefined();
    expect(chatRecord.title).toBe("New Conversation");

    // 2. Retrieve Chat by ID
    const retrievedChat = await chatDbAdapter.getChatById({
      id: chatRecord.id,
      userId: testUserId,
    });
    expect(retrievedChat).toBeDefined();
    expect(retrievedChat?.id).toBe(chatRecord.id);

    // 3. Update Chat Title
    const updatedChat = await chatDbAdapter.updateChat(
      { id: chatRecord.id, userId: testUserId },
      { title: "Refined Conversation" }
    )(db as any);
    expect(updatedChat.title).toBe("Refined Conversation");

    // 4. List Chats
    const listResult = await chatDbAdapter.getChats({
      userId: testUserId,
      limit: 10,
      projectId: testProjectId,
    });
    expect(listResult.chats).toHaveLength(1);
    expect(listResult.chats[0].title).toBe("Refined Conversation");

    // 5. Save Messages in Chat
    const messages = await chatDbAdapter.saveMessages([
      {
        chatId: chatRecord.id,
        role: "user",
        parts: [{ type: "text", text: "Hello AI!" }],
      },
      {
        chatId: chatRecord.id,
        role: "assistant",
        parts: [{ type: "text", text: "Hello! How can I assist you today?" }],
      },
    ])(db as any);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");

    // 6. Retrieve Messages by Chat ID
    const retrievedMessages = await chatDbAdapter.getMessagesByChatId(chatRecord.id);
    expect(retrievedMessages).toHaveLength(2);
    expect(retrievedMessages[0].id).toBe(messages[0].id);

    // 7. Delete a single Message
    await chatDbAdapter.deleteMessageById(messages[0].id)(db as any);
    const messagesAfterDelete = await chatDbAdapter.getMessagesByChatId(chatRecord.id);
    expect(messagesAfterDelete).toHaveLength(1);
    expect(messagesAfterDelete[0].id).toBe(messages[1].id);

    // 8. Delete Chat
    await chatDbAdapter.deleteChat({
      id: chatRecord.id,
      userId: testUserId,
    })(db as any);

    const chatAfterDelete = await chatDbAdapter.getChatById({
      id: chatRecord.id,
      userId: testUserId,
    });
    expect(chatAfterDelete).toBeUndefined();
  });
});
