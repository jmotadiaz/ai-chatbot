import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { execSync } from "child_process";
import { faker } from "@faker-js/faker";
import { eq } from "drizzle-orm";
import { user, chat, message, project } from "../lib/infrastructure/db/schema";
import { generateHashedPassword } from "../lib/features/auth/utils";

config({ path: ".env.development.local" });

const runSeed = async () => {
  console.log("🚀 Starting seed script...");

  // 1. Run migrations
  console.log("⏳ Running migrations...");
  try {
     // Use stdio: 'inherit' to show migration logs
     execSync("pnpm db:migrate", { stdio: "inherit" });
  } catch (error) {
     console.error("❌ Migration failed");
     process.exit(1);
  }
  console.log("✅ Migrations completed");

  // 2. Connect to DB
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not defined");
  }

  // Use max: 1 connection for script
  const connection = postgres(process.env.POSTGRES_URL, { max: 1 });
  const db = drizzle(connection);

  console.log("🌱 Seeding database...");

  // 3. Check/Create User
  let userId: string;
  const existingUser = await db.select().from(user).where(eq(user.email, "test@test.com")).limit(1);

  if (existingUser.length > 0) {
    console.log("User 'test@test.com' already exists. Using existing user.");
    userId = existingUser[0].id;
  } else {
    console.log("Creating user 'test@test.com'...");
    const hashedPassword = generateHashedPassword("1234");
    const [newUser] = await db.insert(user).values({
      email: "test@test.com",
      password: hashedPassword,
    }).returning();
    userId = newUser.id;
  }

  // 4. Create 100 Chats
  console.log("Creating 100 chats...");

  const chatsData = Array.from({ length: 100 }).map(() => ({
    userId: userId,
    title: faker.lorem.sentence(),
  }));

  // Drizzle allows batch insert
  const createdChats = await db.insert(chat).values(chatsData).returning();
  console.log(`✅ Created ${createdChats.length} chats`);

  // 5. Create Messages (10 per chat: 5 user, 5 assistant)
  console.log("Creating messages...");
  const messagesData = [];

  for (const c of createdChats) {
    for (let i = 0; i < 5; i++) {
        // User message
        messagesData.push({
            chatId: c.id,
            role: "user",
            parts: [{ type: "text", text: faker.lorem.sentence() }],
        });
        // Assistant message
        messagesData.push({
            chatId: c.id,
            role: "assistant",
            parts: [{ type: "text", text: faker.lorem.sentence() }],
        });
    }
  }

  // Chunking inserts to avoid potential parameter limits
  const chunkSize = 1000;
  for (let i = 0; i < messagesData.length; i += chunkSize) {
      const chunk = messagesData.slice(i, i + chunkSize);
      await db.insert(message).values(chunk);
      process.stdout.write(`\rInserted ${Math.min(i + chunkSize, messagesData.length)} / ${messagesData.length} messages`);
  }
  console.log("\n✅ Messages created");

  // 6. Create Project
  console.log("Creating project 'test proyect'...");
  const [newProject] = await db.insert(project).values({
      userId: userId,
      name: "test proyect",
      systemPrompt: "You are a helpful assistant",
  }).returning();

  // 7. Assign 5 chats to project
  console.log("Assigning 5 chats to project...");
  const chatsToUpdate = createdChats.slice(0, 5);
  for (const c of chatsToUpdate) {
      await db.update(chat).set({ projectId: newProject.id }).where(eq(chat.id, c.id));
  }

  console.log("✅ Seeding completed successfully!");
  process.exit(0);
};

runSeed().catch((err) => {
  console.error("❌ Seeding failed");
  console.error(err);
  process.exit(1);
});
