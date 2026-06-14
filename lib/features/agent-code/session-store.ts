"use server";

import { randomUUID } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/infrastructure/db/db";
import {
  codingAgentSessions,
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

export async function listSessions(input: { userId: string; project: string }) {
  return getDb()
    .select()
    .from(codingAgentSessions)
    .where(
      and(
        eq(codingAgentSessions.userId, input.userId),
        eq(codingAgentSessions.project, input.project),
      ),
    )
    .orderBy(desc(codingAgentSessions.updatedAt));
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
