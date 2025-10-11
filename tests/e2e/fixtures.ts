/* eslint-disable react-hooks/rules-of-hooks */
import { randomUUID } from "crypto";
import { test as base } from "@playwright/test";
import type { DefaultJWT } from "next-auth/jwt";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { user, User, chat, message, Chat } from "@/lib/db/schema";
import { schema } from "@/lib/db/db";

type NewChat = {
  title: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

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
export const test = base.extend<TestFixtures>({
  db: async ({}, use) => {
    const client = postgres(process.env.POSTGRES_URL!);
    const db = drizzle(client, { schema });

    const [testUser] = await db
      .insert(user)
      .values({
        email: `${randomUUID()}@test.com`,
        password:
          "$2b$10$testtestsalt123456789012uG9dWQd8U1xMOPuQJxFr7eETeM2Yy",
      })
      .returning();

    const addChats = async (newChats: NewChat[]) => {
      const insertedChats: Chat[] = [];
      for (const newChat of newChats) {
        const [insertedChat] = await db
          .insert(chat)
          .values({
            title: newChat.title,
            userId: testUser.id,
          })
          .returning();

        await db.insert(message).values(
          newChat.messages.map(({ role, content }) => ({
            role,
            parts: [{ type: "text", text: content }],
            chatId: insertedChat.id,
          }))
        );
        insertedChats.push(insertedChat);
      }
      return insertedChats;
    };

    // Provide the authenticated user to the test
    await use({ testUser, addChats });
    await client.end();
  },
  authenticatedUser: async ({ page, baseURL, db }, use) => {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      throw new Error("AUTH_SECRET not set");
    }

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
