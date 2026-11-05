/**
 * Social boundary of Session History: the data rules behind the "See all" page
 * of a Project, checked against in-memory PGlite. The sidebar and Session
 * History read through the same `listSessions`, so these rules define both
 * lists — they cannot drift apart.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDb } from "../../helpers/db-setup";
import { getDb } from "@/lib/infrastructure/db/db";
import { codingAgentSessions, user } from "@/lib/infrastructure/db/schema";
import { listSessions } from "@/lib/features/code/session-store";

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

/** Inserts sessions with explicit `updatedAt` so the ordering is deterministic. */
const insertSessions = async (
  userId: string,
  rows: Array<{ project: string; label: string | null; updatedAt: string }>,
) =>
  getDb()
    .insert(codingAgentSessions)
    .values(
      rows.map((row) => ({
        userId,
        project: row.project,
        sessionId: crypto.randomUUID(),
        label: row.label,
        updatedAt: new Date(row.updatedAt),
      })),
    )
    .returning();

const labelsOf = (sessions: Array<{ label: string | null }>) =>
  sessions.map((session) => session.label);

describe("listSessions", () => {
  it("lists only the user's own sessions of the given Project", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    await insertSessions(owner, [
      { project: "alpha", label: "alpha-1", updatedAt: "2024-01-01T00:00:00Z" },
      { project: "beta", label: "beta-1", updatedAt: "2024-01-02T00:00:00Z" },
    ]);
    await insertSessions(other, [
      { project: "alpha", label: "foreign", updatedAt: "2024-01-03T00:00:00Z" },
    ]);

    const { sessions, hasMore } = await listSessions({
      userId: owner,
      project: "alpha",
      limit: 20,
    });

    expect(labelsOf(sessions)).toEqual(["alpha-1"]);
    expect(hasMore).toBe(false);
  });

  it("leaves out sessions that never ran a first Turn", async () => {
    const userId = await createUser("unlabeled");
    await insertSessions(userId, [
      { project: "alpha", label: "ran", updatedAt: "2024-01-01T00:00:00Z" },
      // Created by "New session" and never prompted: no label to show.
      { project: "alpha", label: null, updatedAt: "2024-01-02T00:00:00Z" },
    ]);

    const { sessions } = await listSessions({
      userId,
      project: "alpha",
      limit: 20,
    });

    expect(labelsOf(sessions)).toEqual(["ran"]);
  });

  it("orders by most recent activity", async () => {
    const userId = await createUser("ordering");
    await insertSessions(userId, [
      { project: "alpha", label: "old", updatedAt: "2024-01-01T00:00:00Z" },
      { project: "alpha", label: "newest", updatedAt: "2024-03-01T00:00:00Z" },
      { project: "alpha", label: "middle", updatedAt: "2024-02-01T00:00:00Z" },
    ]);

    const { sessions } = await listSessions({
      userId,
      project: "alpha",
      limit: 20,
    });

    expect(labelsOf(sessions)).toEqual(["newest", "middle", "old"]);
  });

  it("filters labels by case-insensitive substring", async () => {
    const userId = await createUser("filter");
    await insertSessions(userId, [
      { project: "alpha", label: "Fix Login", updatedAt: "2024-01-01T00:00:00Z" },
      { project: "alpha", label: "fix tests", updatedAt: "2024-01-02T00:00:00Z" },
      { project: "alpha", label: "Docs", updatedAt: "2024-01-03T00:00:00Z" },
    ]);

    const { sessions } = await listSessions({
      userId,
      project: "alpha",
      limit: 20,
      filter: "FIX",
    });

    expect(labelsOf(sessions)).toEqual(["fix tests", "Fix Login"]);
  });

  it("reports hasMore only when a row beyond the page exists", async () => {
    const userId = await createUser("paging");
    await insertSessions(
      userId,
      Array.from({ length: 5 }, (_, i) => ({
        project: "alpha",
        label: `session-${i}`,
        updatedAt: `2024-01-0${i + 1}T00:00:00Z`,
      })),
    );

    const firstPage = await listSessions({
      userId,
      project: "alpha",
      limit: 2,
      offset: 0,
    });
    const secondPage = await listSessions({
      userId,
      project: "alpha",
      limit: 2,
      offset: 2,
    });
    const lastPage = await listSessions({
      userId,
      project: "alpha",
      limit: 2,
      offset: 4,
    });

    expect(firstPage.sessions).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.hasMore).toBe(true);
    expect(lastPage.sessions).toHaveLength(1);
    expect(lastPage.hasMore).toBe(false);

    // Consecutive offsets return disjoint rows that cover the whole set.
    const seen = [
      ...firstPage.sessions,
      ...secondPage.sessions,
      ...lastPage.sessions,
    ];
    expect(new Set(seen.map((session) => session.id)).size).toBe(5);
  });

  it("reports hasMore=false when the page size exactly matches the rows", async () => {
    const userId = await createUser("exact");
    await insertSessions(
      userId,
      Array.from({ length: 2 }, (_, i) => ({
        project: "alpha",
        label: `exact-${i}`,
        updatedAt: `2024-02-0${i + 1}T00:00:00Z`,
      })),
    );

    const { sessions, hasMore } = await listSessions({
      userId,
      project: "alpha",
      limit: 2,
    });

    expect(sessions).toHaveLength(2);
    expect(hasMore).toBe(false);
  });

  it("filters inside the page, so a filtered page can still have more", async () => {
    const userId = await createUser("filtered-paging");
    await insertSessions(
      userId,
      Array.from({ length: 4 }, (_, i) => ({
        project: "alpha",
        label: `fix-${i}`,
        updatedAt: `2024-03-0${i + 1}T00:00:00Z`,
      })),
    );

    const page = await listSessions({
      userId,
      project: "alpha",
      limit: 2,
      filter: "fix",
    });

    expect(page.sessions).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });
});
