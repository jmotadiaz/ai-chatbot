import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb } from "../../../helpers/db-setup";
import { sessionFor } from "../../../helpers/session-fixture";
import { getDb } from "@/lib/infrastructure/db/db";
import { chat, user } from "@/lib/infrastructure/db/schema";
import { getChats } from "@/lib/features/chat/queries";
import { getHistoryChats } from "@/lib/features/chat/history/queries";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/features/auth/cached-auth", () => ({
  getSession: vi.fn(),
}));

const { getSession } = await import("@/lib/features/auth/cached-auth");
const { togglePinChat } = await import("@/lib/features/chat/actions");

beforeAll(async () => {
  await setupTestDb();
});

const createUser = async (label: string) => {
  const [row] = await getDb()
    .insert(user)
    .values({ email: `${label}-${crypto.randomUUID().slice(0, 8)}@test.local` })
    .returning();
  return row!.id;
};

const insertChat = async (
  userId: string,
  title: string,
  updatedAt: string,
  pinned = false,
) => {
  const [row] = await getDb()
    .insert(chat)
    .values({
      userId,
      title,
      pinned,
      updatedAt: new Date(updatedAt),
      createdAt: new Date(updatedAt),
    })
    .returning();
  return row!;
};

const readChat = async (id: string) => {
  const [row] = await getDb().select().from(chat).where(eq(chat.id, id));
  return row!;
};

describe("getChats (sidebar list)", () => {
  it("lifts pinned chats to the top, then orders by recency", async () => {
    const userId = await createUser("sidebar-order");
    await insertChat(userId, "old-pinned", "2024-01-01T00:00:00Z", true);
    await insertChat(userId, "newest", "2024-03-01T00:00:00Z");
    await insertChat(userId, "middle", "2024-02-01T00:00:00Z");

    const { chats } = await getChats({ userId, limit: 20 });

    expect(chats.map((c) => c.title)).toEqual([
      "old-pinned",
      "newest",
      "middle",
    ]);
  });

  it("orders differently from history for the same data", async () => {
    const userId = await createUser("sidebar-vs-history");
    await insertChat(userId, "old-pinned", "2024-01-01T00:00:00Z", true);
    await insertChat(userId, "newest", "2024-03-01T00:00:00Z");

    const sidebar = await getChats({ userId, limit: 20 });
    const history = await getHistoryChats({ userId, limit: 20, offset: 0 });

    expect(sidebar.chats[0]!.title).toBe("old-pinned");
    expect(history.chats[0]!.title).toBe("newest");
  });
});

describe("togglePinChat", () => {
  it("flips the pin flag and keeps updatedAt, so history order is unchanged", async () => {
    const userId = await createUser("pin");
    const original = await insertChat(userId, "pinnable", "2024-05-01T00:00:00Z");
    vi.mocked(getSession).mockResolvedValue(sessionFor(userId));

    await togglePinChat(original.id);

    const after = await readChat(original.id);
    expect(after.pinned).toBe(true);
    expect(after.updatedAt.toISOString()).toBe(original.updatedAt.toISOString());
  });

  it("leaves the chat untouched without a session", async () => {
    const userId = await createUser("pin-anon");
    const original = await insertChat(userId, "locked", "2024-06-01T00:00:00Z");
    vi.mocked(getSession).mockResolvedValue(null);

    await togglePinChat(original.id);

    expect((await readChat(original.id)).pinned).toBe(false);
  });
});
