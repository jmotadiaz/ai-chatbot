import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb } from "../db-setup";
import {
  createSession,
  listSessions,
  getSession,
  updateSessionLabel,
} from "@/lib/features/agent-code/session-store";
import {
  codingAgentSessions,
  user as userTable,
} from "@/lib/infrastructure/db/schema";

describe("session-store", () => {
  let db: ReturnType<typeof setupTestDb> extends Promise<infer T> ? T : never;
  const userId = "00000000-0000-0000-0000-000000000001";
  const project = "test-project";

  beforeAll(async () => {
    db = await setupTestDb();
  });

  afterEach(async () => {
    await db.delete(codingAgentSessions).where(eq(codingAgentSessions.userId, userId));
    await db.delete(userTable).where(eq(userTable.id, userId));
  });

  async function seedUser() {
    await db.insert(userTable).values({ id: userId, email: "agent-tester@example.com" });
  }

  it("creates and retrieves a session", async () => {
    await seedUser();
    const session = await createSession({ userId, project, modelId: "Deepseek v4 Pro" });
    expect(session.project).toBe(project);
    expect(session.sessionId).toBeDefined();

    const found = await getSession({ userId, sessionId: session.sessionId });
    expect(found).toBeDefined();
    expect(found?.modelId).toBe("Deepseek v4 Pro");
  });

  it("lists sessions by project", async () => {
    await seedUser();
    await createSession({ userId, project, modelId: "Deepseek v4 Pro" });
    const sessions = await listSessions({ userId, project });
    expect(sessions).toHaveLength(1);
  });

  it("updates session label", async () => {
    await seedUser();
    const session = await createSession({ userId, project });
    await updateSessionLabel({ userId, sessionId: session.sessionId, label: "Refactor" });
    const found = await getSession({ userId, sessionId: session.sessionId });
    expect(found?.label).toBe("Refactor");
  });
});
