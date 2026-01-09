import { randomUUID } from "crypto";
import { config } from "dotenv";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { faker } from "@faker-js/faker";

import { generateHashedPassword } from "../lib/features/auth/utils";
import { schema, type DB } from "../lib/infrastructure/db/db";
import { chat, message, project, user } from "../lib/infrastructure/db/schema";

const TEST_USER_EMAIL = "test@test.com";
const TEST_USER_PASSWORD = "123456";
const TEST_USER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const SEED_PROJECT_NAME = "Seed Project";
const SEED_PROJECT_SYSTEM_PROMPT = "Test project";

type Tx = Parameters<DB["transaction"]>[0] extends (
  tx: infer T
) => Promise<unknown>
  ? T
  : never;

function parseArgs(argv: string[]) {
  const has = (flag: string) => argv.includes(flag);
  const getNumber = (name: string, defaultValue: number) => {
    const raw = argv.find((a) => a.startsWith(`${name}=`))?.split("=", 2)[1];
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : defaultValue;
  };

  return {
    reset: has("--reset") ? true : has("--no-reset") ? false : true,
    chats: getNumber("--chats", 100),
    userMessagesPerChat: getNumber("--user-messages", 5),
    assistantMessagesPerChat: getNumber("--assistant-messages", 5),
    projectChats: getNumber("--project-chats", 5),
    seed: getNumber("--seed", 1234),
  };
}

async function runMigrations(client: postgres.Sql) {
  const db = drizzle(client);
  console.log("⏳ Running migrations...");
  const start = Date.now();
  await migrate(db, { migrationsFolder: "./lib/infrastructure/db/migrations" });
  console.log("✅ Migrations completed in", Date.now() - start, "ms");
}

async function upsertTestUser(tx: Tx) {
  const passwordHash = generateHashedPassword(TEST_USER_PASSWORD);
  const existing = await tx
    .select()
    .from(user)
    .where(eq(user.email, TEST_USER_EMAIL))
    .orderBy(asc(user.createdAt))
    .limit(1000);

  if (existing.length > 0) {
    // NextAuth takes the first row returned by `getUser(email)` (no ORDER BY),
    // so ensure *all* rows with this email have the same password.
    await tx
      .update(user)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(user.email, TEST_USER_EMAIL));

    // Prefer the deterministic ID if present.
    const exact = existing.find((u) => u.id === TEST_USER_ID);
    return (exact ?? existing[0]).id;
  }

  const [created] = await tx
    .insert(user)
    .values({
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      password: passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created.id;
}

async function upsertSeedProject(tx: Tx, userId: string) {
  const existing = await tx
    .select()
    .from(project)
    .where(and(eq(project.userId, userId), eq(project.name, SEED_PROJECT_NAME)))
    .limit(1);

  if (existing.length > 0) {
    const existingProject = existing[0];
    const [updated] = await tx
      .update(project)
      .set({
        systemPrompt: SEED_PROJECT_SYSTEM_PROMPT,
        updatedAt: new Date(),
      })
      .where(eq(project.id, existingProject.id))
      .returning();
    return updated;
  }

  const [created] = await tx
    .insert(project)
    .values({
      id: randomUUID(),
      userId,
      name: SEED_PROJECT_NAME,
      systemPrompt: SEED_PROJECT_SYSTEM_PROMPT,
      hasPromptRefiner: false,
      tools: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

async function main() {
  config({
    path:
      process.env.NEXT_PUBLIC_ENV === "test"
        ? ".env.test"
        : ".env.development.local",
  });

  const args = parseArgs(process.argv.slice(2));
  faker.seed(args.seed);

  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not defined");
  }

  const client = postgres(process.env.POSTGRES_URL, { max: 1 });
  try {
    await runMigrations(client);

    const db = drizzle(client, { schema }) as DB;

    const result = await db.transaction(async (tx) => {
      const userId = await upsertTestUser(tx);

      if (args.reset) {
        // Deleting projects cascades to chats; we also delete any remaining chats
        // without a project for this user.
        await tx.delete(project).where(eq(project.userId, userId));
        await tx.delete(chat).where(eq(chat.userId, userId));
      }

      const seedProject = await upsertSeedProject(tx, userId);

      const totalMessagesPerChat =
        args.userMessagesPerChat + args.assistantMessagesPerChat;
      if (totalMessagesPerChat <= 0) {
        throw new Error("Total messages per chat must be > 0");
      }

      const safeProjectChats = Math.max(
        0,
        Math.min(args.projectChats, args.chats)
      );

      const createdChatIds: string[] = [];

      for (let i = 0; i < args.chats; i++) {
        const chatId = randomUUID();
        const title = faker.lorem.words(5);
        const assignedProjectId =
          i < safeProjectChats ? seedProject.id : undefined;

        await tx.insert(chat).values({
          id: chatId,
          userId,
          title,
          projectId: assignedProjectId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const messages: Array<{
          id: string;
          chatId: string;
          role: string;
          parts: unknown;
          metadata: unknown;
          createdAt: Date;
        }> = [];

        // Interleave user/assistant as much as possible
        const maxTurns = Math.max(
          args.userMessagesPerChat,
          args.assistantMessagesPerChat
        );
        let userLeft = args.userMessagesPerChat;
        let assistantLeft = args.assistantMessagesPerChat;

        for (let turn = 0; turn < maxTurns; turn++) {
          if (userLeft > 0) {
            messages.push({
              id: randomUUID(),
              chatId,
              role: "user",
              parts: [{ type: "text", text: faker.lorem.paragraph() }],
              metadata: null,
              createdAt: new Date(),
            });
            userLeft--;
          }

          if (assistantLeft > 0) {
            messages.push({
              id: randomUUID(),
              chatId,
              role: "assistant",
              parts: [{ type: "text", text: faker.lorem.paragraph() }],
              metadata: null,
              createdAt: new Date(),
            });
            assistantLeft--;
          }
        }

        await tx.insert(message).values(messages);

        createdChatIds.push(chatId);
      }

      return {
        userId,
        projectId: seedProject.id,
        createdChats: createdChatIds.length,
        projectChats: safeProjectChats,
        messagesPerChat: totalMessagesPerChat,
      };
    });

    console.log("✅ Seed completed");
    console.log(result);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("❌ Seed failed");
  console.error(err);
  process.exit(1);
});
