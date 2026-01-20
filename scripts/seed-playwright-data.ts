import { randomUUID } from "crypto";
import { config } from "dotenv";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { reset } from "drizzle-seed";
import postgres from "postgres";

import { generateHashedPassword } from "../lib/features/auth/utils";
import { schema, type DB } from "../lib/infrastructure/db/db";
import { chat, message, project, user } from "../lib/infrastructure/db/schema";

const TEST_USER_EMAIL = "test@test.com";
const TEST_USER_PASSWORD = "123456";
const TEST_USER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d480";
const SEED_PROJECT_NAME = "Playwright Test Project";
const SEED_PROJECT_SYSTEM_PROMPT =
  "You are a helpful assistant for Playwright testing.";

type Tx = Parameters<DB["transaction"]>[0] extends (
  tx: infer T,
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
    chats: getNumber("--chats", 3),
    messagesPerChat: getNumber("--messages-per-chat", 2),
  };
}

async function runMigrations(client: postgres.Sql) {
  const db = drizzle(client);
  console.log("⏳ Running migrations...");
  const start = Date.now();
  await migrate(db, { migrationsFolder: "./lib/infrastructure/db/migrations" });
  console.log("✅ Migrations completed in", Date.now() - start, "ms");
  await reset(db, schema);
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
    // Ensure all rows with this email have the same password
    await tx
      .update(user)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(user.email, TEST_USER_EMAIL));

    // Prefer the deterministic ID if present
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

async function createPlaywrightTestChats(
  tx: Tx,
  userId: string,
  projectId: string,
  chatsCount: number,
  messagesPerChat: number,
) {
  const createdChatIds: string[] = [];

  for (let i = 0; i < chatsCount; i++) {
    const chatId = randomUUID();
    const title = `Playwright Test Chat ${i + 1}`;

    await tx.insert(chat).values({
      id: chatId,
      userId,
      title,
      projectId,
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

    // Create simple alternating user/assistant messages
    for (let msgIndex = 0; msgIndex < messagesPerChat; msgIndex++) {
      const isUserMessage = msgIndex % 2 === 0;

      messages.push({
        id: randomUUID(),
        chatId,
        role: isUserMessage ? "user" : "assistant",
        parts: [
          {
            type: "text",
            text: isUserMessage
              ? `Test message ${msgIndex + 1} from user`
              : `Test response ${msgIndex + 1} from assistant`,
          },
        ],
        metadata: null,
        createdAt: new Date(),
      });
    }

    await tx.insert(message).values(messages);
    createdChatIds.push(chatId);
  }

  return createdChatIds;
}

async function main() {
  config({
    path: ".env.test",
  });

  const args = parseArgs(process.argv.slice(2));

  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not defined in .env.test");
  }

  const client = postgres(process.env.POSTGRES_URL, { max: 1 });
  try {
    await runMigrations(client);

    const db = drizzle(client, { schema }) as DB;

    const result = await db.transaction(async (tx) => {
      const userId = await upsertTestUser(tx);

      if (args.reset) {
        // Clean up existing test data
        await tx.delete(project).where(eq(project.userId, userId));
        await tx.delete(chat).where(eq(chat.userId, userId));
      }

      const seedProject = await upsertSeedProject(tx, userId);

      const createdChatIds = await createPlaywrightTestChats(
        tx,
        userId,
        seedProject.id,
        args.chats,
        args.messagesPerChat,
      );

      return {
        userId,
        projectId: seedProject.id,
        userEmail: TEST_USER_EMAIL,
        userPassword: TEST_USER_PASSWORD,
        createdChats: createdChatIds.length,
        messagesPerChat: args.messagesPerChat,
      };
    });

    console.log("✅ Playwright seed data completed");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("❌ Playwright seed failed");
  console.error(err);
  process.exit(1);
});
