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
  project,
  Project,
} from "@/lib/infrastructure/db/schema";
import { schema } from "@/lib/infrastructure/db/db";

type NewProject = {
  name: string;
  systemPrompt: string;
  defaultModel?: string;
  defaultTemperature?: number;
  tools?: string[];
  hasPromptRefiner?: boolean;

  webSearchNumResults?: number;
};

type NewChat = {
  title: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  pinned?: boolean;
  updatedAt?: Date;
};
interface TestFixtures {
  dbClient: {
    client: postgres.Sql;
    db: ReturnType<typeof drizzle>;
  };
  authenticatedUser: User;
  testUser: User;
  db: {
    testUser: User;
    addChats: (newChats: NewChat[]) => Promise<Chat[]>;
    addProjects: (newProjects: NewProject[]) => Promise<Project[]>;
  };
}

/**
 * Extended test with fixtures for AI providers and database
 * This allows dependency injection for testing
 */
export const test = base.extend<TestFixtures>({
  // Shared Database Client Fixture
  dbClient: async ({}, use) => {
    const client = postgres(
      process.env.POSTGRES_URL ??
        "postgres://postgres:postgres@localhost:5434/test",
    );
    const db = drizzle(client, { schema });

    await use({ client, db });

    await client.end();
  },

  // Main User Fixture: Creates user in DB AND authenticates them in the browser
  authenticatedUser: [
    async ({ page, baseURL, dbClient }, use) => {
      const { db } = dbClient;

      // Use salt rounds = 1 for fast hashing in tests
      const hashedPassword = hashSync("test-password", 1);

      const [newUser] = await db
        .insert(user)
        .values({
          email: `test-${randomUUID()}@test.com`,
          password: hashedPassword,
        })
        .returning();

      // 2. Authenticate (Inject Cookie)
      const secret = process.env.AUTH_SECRET ?? "test-auth-secret-change-me";
      const token: DefaultJWT = {
        id: newUser.id,
        email: newUser.email,
        type: "regular",
      };

      const { encode } = await import("next-auth/jwt");
      const cookieName = "authjs.session-token";

      const encodedToken = await encode({
        token,
        secret,
        salt: cookieName,
      });

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

      // Provide the authenticated user (full object) to the test
      await use(newUser);
    },
    { auto: true },
  ],

  // DB Fixture: Depends on authenticatedUser, so accessing db guarantees an authenticated session
  db: async ({ authenticatedUser, dbClient }, use) => {
    const { db } = dbClient;

    const addChats = async (newChats: NewChat[]) => {
      const insertedChats: Chat[] = [];
      await db.transaction(async (tx) => {
        for (const newChat of newChats) {
          const [insertedChat] = await tx
            .insert(chat)
            .values({
              title: newChat.title,
              userId: authenticatedUser.id,
              pinned: newChat.pinned,
              updatedAt: newChat.updatedAt,
            })
            .returning();

          await tx.insert(message).values(
            newChat.messages.map(({ role, content }) => ({
              role,
              parts: [{ type: "text", text: content }],
              chatId: insertedChat.id,
            })),
          );
          insertedChats.push(insertedChat);
        }
      });
      return insertedChats;
    };

    const addProjects = async (newProjects: NewProject[]) => {
      const insertedProjects: Project[] = [];
      for (const newProject of newProjects) {
        const [insertedProject] = await db
          .insert(project)
          .values({
            userId: authenticatedUser.id,
            name: newProject.name,
            systemPrompt: newProject.systemPrompt,
            defaultModel: newProject.defaultModel,
            defaultTemperature: newProject.defaultTemperature,
            tools: newProject.tools,
            hasPromptRefiner: newProject.hasPromptRefiner ?? false,

            webSearchNumResults: newProject.webSearchNumResults,
          })
          .returning();
        insertedProjects.push(insertedProject);
      }
      return insertedProjects;
    };

    await use({ testUser: authenticatedUser, addChats, addProjects });
  },

  // Deprecated/Alias provided for backward compatibility if strict types needed,
  // but pointing to authenticatedUser to ensure singleton behavior per test
  testUser: async ({ authenticatedUser }, use) => {
    await use(authenticatedUser);
  },
});

export { expect } from "@playwright/test";
