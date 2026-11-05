"use server";

import { randomUUID } from "node:crypto";
import { eq, and, desc, ilike, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/infrastructure/db/db";
import {
  codingAgentSessions,
  type CodingAgentSession,
  type NewCodingAgentSession,
} from "@/lib/infrastructure/db/schema";

export async function createSession(input: {
  userId: string;
  project: string;
  modelId?: string;
  label?: string;
}) {
  const sessionId = randomUUID();
  const values: NewCodingAgentSession = {
    userId: input.userId,
    project: input.project,
    sessionId,
    modelId: input.modelId ?? null,
    label: input.label ?? null,
  };
  const [row] = await getDb()
    .insert(codingAgentSessions)
    .values(values as NewCodingAgentSession)
    .returning();
  return row;
}

export async function getSession(input: { userId: string; sessionId: string }) {
  const [row] = await getDb()
    .select()
    .from(codingAgentSessions)
    .where(
      and(
        eq(codingAgentSessions.userId, input.userId),
        eq(codingAgentSessions.sessionId, input.sessionId),
      ),
    );
  return row;
}

/**
 * The one definition of what a session listing shows: the user's own sessions
 * of one Project, most recently active first, and only those that already ran
 * their first Turn (a session is created before its first prompt, and a row
 * without a label has no name to show). The sidebar and Session History both
 * read through here, so they cannot disagree.
 */
export async function listSessions(input: {
  userId: string;
  project: string;
  limit: number;
  offset?: number;
  filter?: string;
}): Promise<{ sessions: CodingAgentSession[]; hasMore: boolean }> {
  const { userId, project, limit, offset = 0, filter = "" } = input;

  // One row past the page: its presence is the whole `hasMore` answer.
  const rows = await getDb()
    .select()
    .from(codingAgentSessions)
    .where(
      and(
        eq(codingAgentSessions.userId, userId),
        eq(codingAgentSessions.project, project),
        isNotNull(codingAgentSessions.label),
        filter ? ilike(codingAgentSessions.label, `%${filter}%`) : undefined,
      ),
    )
    .orderBy(desc(codingAgentSessions.updatedAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  return { sessions: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

export async function updateSessionLabel(input: {
  userId: string;
  sessionId: string;
  label: string;
}) {
  await getDb()
    .update(codingAgentSessions)
    .set({ label: input.label, updatedAt: new Date() })
    .where(
      and(
        eq(codingAgentSessions.userId, input.userId),
        eq(codingAgentSessions.sessionId, input.sessionId),
      ),
    );
}


export async function touchSession(input: { userId: string; sessionId: string }) {
  await getDb()
    .update(codingAgentSessions)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(codingAgentSessions.userId, input.userId),
        eq(codingAgentSessions.sessionId, input.sessionId),
      ),
    );
}

export async function deleteSession(input: {
  userId: string;
  sessionId: string;
}) {
  await getDb()
    .delete(codingAgentSessions)
    .where(
      and(
        eq(codingAgentSessions.userId, input.userId),
        eq(codingAgentSessions.sessionId, input.sessionId),
      ),
    );
}
