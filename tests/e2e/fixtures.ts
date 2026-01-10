/* eslint-disable react-hooks/rules-of-hooks */
import { randomUUID } from "crypto";
import { test as base } from "@playwright/test";
import type { DefaultJWT } from "next-auth/jwt";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import {
  user,
  User,
  chat,
  message,
  Chat,
} from "@/lib/infrastructure/db/schema";
import { schema } from "@/lib/infrastructure/db/db";

type NewChat = {
  title: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  pinned?: boolean;
  updatedAt?: Date;
};

interface WorkerFixtures {
  workerDb: ReturnType<typeof drizzle>;
  workerUser: User;
}

interface TestFixtures {
  authenticatedUser: { id: string; email: string };
  db: {
    testUser: User;
    addChats: (newChats: NewChat[]) => Promise<Chat[]>;
  };
}

/**
 * Extended test with fixtures for AI providers and database
 * This allows dependency injection for testing
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Worker scoped fixtures
  workerDb: [
    async ({}, use) => {
      const client = postgres(
        process.env.POSTGRES_URL ??
          "postgres://postgres:postgres@localhost:5434/test"
      );
      const db = drizzle(client, { schema });
      await use(db);
      await client.end();
    },
    { scope: "worker" },
  ],

  workerUser: [
    async ({ workerDb }, use) => {
      const [testUser] = await workerDb
        .insert(user)
        .values({
          email: `${randomUUID()}@test.com`,
          password:
            "$2b$10$testtestsalt123456789012uG9dWQd8U1xMOPuQJxFr7eETeM2Yy",
        })
        .returning();
      await use(testUser);
    },
    { scope: "worker" },
  ],

  // Test scoped fixtures
  db: async ({ workerDb, workerUser }, use) => {
    const addChats = async (newChats: NewChat[]) => {
      const insertedChats: Chat[] = [];
      await workerDb.transaction(async (tx) => {
        for (const newChat of newChats) {
          const [insertedChat] = await tx
            .insert(chat)
            .values({
              title: newChat.title,
              userId: workerUser.id,
              pinned: newChat.pinned,
              updatedAt: newChat.updatedAt,
            })
            .returning();

          await tx.insert(message).values(
            newChat.messages.map(({ role, content }) => ({
              role,
              parts: [{ type: "text", text: content }],
              chatId: insertedChat.id,
            }))
          );
          insertedChats.push(insertedChat);
        }
      });
      return insertedChats;
    };

    await use({ testUser: workerUser, addChats });

    // Cleanup chats after each test to prevent pollution since we reuse the user
    await workerDb.delete(chat).where(eq(chat.userId, workerUser.id));
  },

  authenticatedUser: async ({ page, baseURL, workerUser }, use) => {
    const secret = process.env.AUTH_SECRET ?? "test-auth-secret-change-me";

    const token: DefaultJWT = {
      id: workerUser.id,
      email: workerUser.email,
      type: "regular",
    };

    const { encode } = await import("next-auth/jwt");
    const cookieName = "authjs.session-token";

    const encodedToken = await encode({
      token,
      secret,
      salt: cookieName,
    });

    // --- Step 3: Set session cookie ---

    // Derive correct domain from baseURL (strip protocol and port)
    const url = new URL(baseURL ?? "http://localhost:3000");
    const domain = url.hostname;

    await page.context().addCookies([
      {
        name: cookieName,
        value: encodedToken,
        domain,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 1 week
      },
    ]);

    // Provide the authenticated user to the test
    await use({ id: workerUser.id, email: workerUser.email });
  },
});

export { expect } from "@playwright/test";
