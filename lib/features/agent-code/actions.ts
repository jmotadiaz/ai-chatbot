"use server";

import { listProjects } from "./project-resolver";
import {
  createSession,
  listSessions,
  getSession,
} from "./session-store";
import { filterAvailableChatModels } from "./model-mapping";
import { WorkerClient } from "./worker-client";
import { auth } from "@/lib/features/auth/auth-config";

function assertEnabled() {
  if (process.env.CODING_AGENT_ENABLED !== "true") {
    throw new Error("Coding agent is not enabled");
  }
}

async function getUserId() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

export async function getCodingAgentProjects() {
  assertEnabled();
  const root = process.env.CODING_AGENT_PROJECTS_ROOT;
  if (!root) return [];
  return listProjects(root);
}

export async function getCodingAgentSessions(project: string) {
  assertEnabled();
  const userId = await getUserId();
  return listSessions({ userId, project });
}

export async function createCodingAgentSession(project: string, modelId?: string) {
  assertEnabled();
  const userId = await getUserId();
  return createSession({ userId, project, modelId });
}

export async function getCodingAgentSession(project: string, sessionId: string) {
  assertEnabled();
  const userId = await getUserId();
  return getSession({ userId, sessionId });
}

export async function getCodingAgentModels() {
  assertEnabled();
  const client = new WorkerClient();
  const { models } = await client.getAvailableModels();
  return filterAvailableChatModels(models);
}
