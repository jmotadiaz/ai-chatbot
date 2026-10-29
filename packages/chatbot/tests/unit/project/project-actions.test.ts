/**
 * Social unit tests for the Project server actions and queries (ticket 06).
 *
 * Collaborators are REAL: the actions, the zod validation, the Drizzle queries
 * and the transaction helper run over in-memory PGlite (`setupTestDb`). Only the
 * request boundary is substituted: the session (`getSession`) and Next's cache
 * revalidation, which need a Next request context.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "../../helpers/db-setup";
import { user as userTable, project as projectTable } from "@/lib/infrastructure/db/schema";
import type { DB } from "@/lib/infrastructure/db/db";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const session = vi.hoisted(() => ({
  current: null as null | { user: { id: string } },
}));

vi.mock("@/lib/features/auth/cached-auth", () => ({
  getSession: async () => session.current,
}));

const {
  createProject,
  updateProject,
  deleteProject,
} = await import("@/lib/features/project/actions");
const { getProjectById, getProjectsByUserId } = await import(
  "@/lib/features/project/queries"
);

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";

let db: DB;

const asUser = (id: string) => {
  session.current = { user: { id } };
};

const asAnonymous = () => {
  session.current = null;
};

beforeAll(async () => {
  db = await setupTestDb();
  await db.insert(userTable).values([
    { id: OWNER_ID, email: "owner@example.com" },
    { id: OTHER_ID, email: "other@example.com" },
  ]);
});

beforeEach(async () => {
  asUser(OWNER_ID);
  await db.delete(projectTable);
});

const validInput = {
  name: "Alpha Project",
  systemPrompt: "You are a specialized research assistant.",
  isActive: true,
};

describe("createProject", () => {
  it("persists the project for the session user with its advanced settings", async () => {
    const created = await createProject({
      ...validInput,
      defaultModel: "basicChat",
      defaultTemperature: 0.8,
      defaultTopP: 0.9,
      defaultTopK: 40,
      webSearchNumResults: 5,
      tools: ["rag"],
    });

    expect(created.userId).toBe(OWNER_ID);
    const stored = await getProjectById({ id: created.id, userId: OWNER_ID });
    expect(stored).toMatchObject({
      name: "Alpha Project",
      defaultModel: "basicChat",
      defaultTemperature: 0.8,
      defaultTopP: 0.9,
      defaultTopK: 40,
      webSearchNumResults: 5,
      tools: ["rag"],
      isActive: true,
    });
  });

  it("rejects an anonymous caller and stores nothing", async () => {
    asAnonymous();
    await expect(createProject(validInput)).rejects.toThrow("Unauthorized");
    expect(await db.select().from(projectTable)).toHaveLength(0);
  });

  it.each([
    ["an empty name", { name: "" }],
    ["an empty system prompt", { systemPrompt: "" }],
    ["a temperature above 2", { defaultTemperature: 2.5 }],
    ["a topP above 1", { defaultTopP: 1.5 }],
    ["a negative topK", { defaultTopK: -1 }],
  ])("rejects %s with a validation error and stores nothing", async (_label, override) => {
    await expect(createProject({ ...validInput, ...override })).rejects.toThrow(
      "Invalid project data",
    );
    expect(await db.select().from(projectTable)).toHaveLength(0);
  });
});

describe("updateProject", () => {
  it("updates the owner's project fields, including the advanced settings", async () => {
    const created = await createProject(validInput);

    await updateProject(created.id, {
      name: "Beta Project",
      systemPrompt: "Updated system prompt",
      defaultTemperature: 0.3,
    });

    const stored = await getProjectById({ id: created.id, userId: OWNER_ID });
    expect(stored).toMatchObject({
      name: "Beta Project",
      systemPrompt: "Updated system prompt",
      defaultTemperature: 0.3,
    });
  });

  it("rejects an anonymous caller without changing the project", async () => {
    const created = await createProject(validInput);
    asAnonymous();

    await expect(updateProject(created.id, { name: "Hijacked" })).rejects.toThrow(
      "Unauthorized",
    );
    asUser(OWNER_ID);
    expect(
      (await getProjectById({ id: created.id, userId: OWNER_ID }))?.name,
    ).toBe("Alpha Project");
  });

  it("rejects invalid updates with a validation error", async () => {
    const created = await createProject(validInput);

    await expect(
      updateProject(created.id, { defaultTemperature: 3 }),
    ).rejects.toThrow("Invalid project data");
  });

  it("never modifies another user's project", async () => {
    const created = await createProject(validInput);
    asUser(OTHER_ID);

    await updateProject(created.id, { name: "Hijacked" });

    asUser(OWNER_ID);
    expect(
      (await getProjectById({ id: created.id, userId: OWNER_ID }))?.name,
    ).toBe("Alpha Project");
  });
});

describe("deleteProject", () => {
  it("removes the owner's project", async () => {
    const created = await createProject(validInput);

    await deleteProject(created.id);

    expect(await getProjectById({ id: created.id, userId: OWNER_ID })).toBeUndefined();
  });

  it("keeps another user's project", async () => {
    const created = await createProject(validInput);
    asUser(OTHER_ID);

    await deleteProject(created.id);

    asUser(OWNER_ID);
    expect(await getProjectById({ id: created.id, userId: OWNER_ID })).toBeDefined();
  });

  it("is a silent no-op for an anonymous caller", async () => {
    const created = await createProject(validInput);
    asAnonymous();

    await expect(deleteProject(created.id)).resolves.toBeUndefined();

    asUser(OWNER_ID);
    expect(await getProjectById({ id: created.id, userId: OWNER_ID })).toBeDefined();
  });
});

describe("project queries", () => {
  it("getProjectById is scoped to the owner", async () => {
    const created = await createProject(validInput);

    expect(await getProjectById({ id: created.id, userId: OTHER_ID })).toBeUndefined();
    expect(await getProjectById({ id: created.id, userId: OWNER_ID })).toBeDefined();
  });

  it("getProjectsByUserId lists only the owner's active, named projects", async () => {
    await createProject({ ...validInput, name: "Visible" });
    await createProject({ ...validInput, name: "Inactive", isActive: false });
    await createProject({ ...validInput, name: "Second" });
    asUser(OTHER_ID);
    await createProject({ ...validInput, name: "Foreign" });
    asUser(OWNER_ID);
    await db.insert(projectTable).values({
      userId: OWNER_ID,
      name: "",
      systemPrompt: "",
      isActive: true,
    });

    const listed = await getProjectsByUserId({ userId: OWNER_ID });

    expect(listed.map((p) => p.name).sort()).toEqual(["Second", "Visible"]);
  });
});
