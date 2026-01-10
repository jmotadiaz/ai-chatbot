/* eslint-disable react-hooks/rules-of-hooks */
import { randomUUID } from "crypto";
import { test as base } from "@playwright/test";
import type { DefaultJWT } from "next-auth/jwt";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hashSync } from "bcrypt-ts";
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
  // Worker-scoped fixture: creates ONE user per worker thread
  workerUser: [
    async ({}, use) => {
      const client = postgres(
        process.env.POSTGRES_URL ??
          "postgres://postgres:postgres@localhost:5434/test"
      );
      const db = drizzle(client, { schema });

      // Use salt rounds = 1 for fast hashing in tests
      const hashedPassword = hashSync("test-password", 1);

      const [testUser] = await db
        .insert(user)
        .values({
          email: `worker-${randomUUID()}@test.com`,
          password: hashedPassword,
        })
        .returning();

      await use(testUser);
      await client.end();
    },
    { scope: "worker" },
  ],

  // Test-scoped fixture: reuses workerUser, provides DB helpers
  db: async ({ workerUser }, use) => {
    const client = postgres(
      process.env.POSTGRES_URL ??
        "postgres://postgres:postgres@localhost:5434/test"
    );
    const db = drizzle(client, { schema });

    const addChats = async (newChats: NewChat[]) => {
      const insertedChats: Chat[] = [];
      await db.transaction(async (tx) => {
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
    await client.end();
  },

  authenticatedUser: async ({ page, baseURL, db }, use) => {
    const secret = process.env.AUTH_SECRET ?? "test-auth-secret-change-me";

    const { testUser } = db;

    const token: DefaultJWT = {
      id: testUser.id,
      email: testUser.email,
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
    await use({ id: testUser.id, email: testUser.email });
  },
});

export { expect } from "@playwright/test";
