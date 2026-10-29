/**
 * Social boundary of the history listing (ticket 05): the data rules behind
 * the "See all" page, checked against in-memory PGlite. They replace the
 * title-filter, root-only and pagination assertions of the former
 * `history.spec.ts` E2E. The browser-only guarantee (real viewport
 * intersection for infinite scroll) stays in the E2E layer.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "../../../helpers/db-setup";
import { sessionFor } from "../../../helpers/session-fixture";
import { getDb } from "@/lib/infrastructure/db/db";
import {
  chat,
  project as projectTable,
  user,
} from "@/lib/infrastructure/db/schema";
import { getHistoryChats } from "@/lib/features/chat/history/queries";

vi.mock("@/lib/features/auth/cached-auth", () => ({
  getSession: vi.fn(),
}));

const { getSession } = await import("@/lib/features/auth/cached-auth");
const { getHistoryChatsAction } = await import(
  "@/lib/features/chat/history/actions"
);

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

/** Inserts chats with explicit `updatedAt` so the ordering is deterministic. */
const insertChats = async (
  userId: string,
  rows: Array<{
    title: string;
    updatedAt: string;
    pinned?: boolean;
    projectId?: string | null;
  }>,
) =>
  getDb()
    .insert(chat)
    .values(
      rows.map((row) => ({
        userId,
        title: row.title,
        pinned: row.pinned ?? false,
        updatedAt: new Date(row.updatedAt),
        createdAt: new Date(row.updatedAt),
        projectId: row.projectId ?? null,
      })),
    )
    .returning();

const titlesOf = (chats: Array<{ title: string | null }>) =>
  chats.map((c) => c.title);

describe("getHistoryChats", () => {
  it("lists only the user's own root chats, never project chats", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    const [project] = await getDb()
      .insert(projectTable)
      .values({ userId: owner, name: "p", systemPrompt: "" })
      .returning();
    const projectId = project!.id;
    await insertChats(owner, [
      { title: "root-a", updatedAt: "2024-01-01T00:00:00Z" },
      { title: "in-project", updatedAt: "2024-01-02T00:00:00Z", projectId },
    ]);
    await insertChats(other, [
      { title: "foreign", updatedAt: "2024-01-03T00:00:00Z" },
    ]);

    const { chats, hasMore } = await getHistoryChats({
      userId: owner,
      limit: 20,
      offset: 0,
    });

    expect(titlesOf(chats)).toEqual(["root-a"]);
    expect(hasMore).toBe(false);
  });

  it("orders by most recent update and ignores pinning", async () => {
    const userId = await createUser("ordering");
    await insertChats(userId, [
      { title: "old-pinned", updatedAt: "2024-01-01T00:00:00Z", pinned: true },
      { title: "newest", updatedAt: "2024-03-01T00:00:00Z" },
      { title: "middle", updatedAt: "2024-02-01T00:00:00Z" },
    ]);

    const { chats } = await getHistoryChats({ userId, limit: 20, offset: 0 });

    // Pinned chats are NOT lifted here; the sidebar does that. The two
    // orderings are deliberately different (see sidebar-chats-and-pin.test.ts).
    expect(titlesOf(chats)).toEqual(["newest", "middle", "old-pinned"]);
  });

  it("filters titles by case-insensitive substring", async () => {
    const userId = await createUser("filter");
    await insertChats(userId, [
      { title: "Quarterly Report", updatedAt: "2024-01-01T00:00:00Z" },
      { title: "report draft", updatedAt: "2024-01-02T00:00:00Z" },
      { title: "Lunch plans", updatedAt: "2024-01-03T00:00:00Z" },
    ]);

    const { chats } = await getHistoryChats({
      userId,
      limit: 20,
      offset: 0,
      filter: "REPORT",
    });

    expect(titlesOf(chats)).toEqual(["report draft", "Quarterly Report"]);
  });

  it("reports hasMore only when a row beyond the page exists", async () => {
    const userId = await createUser("paging");
    await insertChats(
      userId,
      Array.from({ length: 5 }, (_, i) => ({
        title: `chat-${i}`,
        updatedAt: `2024-01-0${i + 1}T00:00:00Z`,
      })),
    );

    const firstPage = await getHistoryChats({ userId, limit: 2, offset: 0 });
    const secondPage = await getHistoryChats({ userId, limit: 2, offset: 2 });
    const lastPage = await getHistoryChats({ userId, limit: 2, offset: 4 });

    expect(firstPage.chats).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.hasMore).toBe(true);
    expect(lastPage.chats).toHaveLength(1);
    expect(lastPage.hasMore).toBe(false);

    // Consecutive offsets return disjoint rows that cover the whole set.
    const seen = [...firstPage.chats, ...secondPage.chats, ...lastPage.chats];
    expect(new Set(seen.map((c) => c.id)).size).toBe(5);
  });

  it("reports hasMore=false when the page size exactly matches the rows", async () => {
    const userId = await createUser("exact");
    await insertChats(
      userId,
      Array.from({ length: 2 }, (_, i) => ({
        title: `exact-${i}`,
        updatedAt: `2024-02-0${i + 1}T00:00:00Z`,
      })),
    );

    const { chats, hasMore } = await getHistoryChats({
      userId,
      limit: 2,
      offset: 0,
    });

    expect(chats).toHaveLength(2);
    expect(hasMore).toBe(false);
  });
});

describe("getHistoryChatsAction", () => {
  it("returns an empty, closed page when there is no session", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const result = await getHistoryChatsAction({ limit: 20, offset: 0 });

    expect(result).toEqual({ chats: [], hasMore: false });
  });

  it("scopes the page to the session user", async () => {
    const userId = await createUser("action");
    await insertChats(userId, [
      { title: "mine", updatedAt: "2024-04-01T00:00:00Z" },
    ]);
    vi.mocked(getSession).mockResolvedValueOnce(sessionFor(userId));

    const result = await getHistoryChatsAction({ limit: 20, offset: 0 });

    expect(titlesOf(result.chats)).toEqual(["mine"]);
  });

  it("rejects a page size above the 100-row contract", async () => {
    await expect(
      getHistoryChatsAction({ limit: 101, offset: 0 }),
    ).rejects.toThrow();
  });
});
