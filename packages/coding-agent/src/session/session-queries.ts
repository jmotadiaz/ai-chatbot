import type { ThinkingLevel } from "models";
import { getTraceLogger as getWorkerLogger } from "tracing";
import { ensureEventLog } from "./session-entry";
import type { Cursor } from "../agui/event-log";
import { convertPiMessagesToAgui } from "../agui/agui-messages";
import { getProjectPrompts, resolveProjectPrompt, type PromptSummary } from "../runtime/prompts";
import { sessionCwd } from "./session-entry";
import type { SessionRegistry } from "./session-registry";

export interface CodingAgentSkill {
  name: string;
  description: string;
}

export interface SessionStatus {
  running: boolean;
}

/**
 * HTTP-border cursor: same shape as the event log's `Cursor` (single
 * source of truth); the session snapshot emits it and connectToSession
 * consumes it back.
 */
export type SessionCursor = Cursor;

export interface PendingQueues {
  steering: string[];
  followUp: string[];
}

export interface SessionSnapshot {
  messages: Array<any>;
  cursor: SessionCursor | null;
  running: boolean;
  /**
   * Surviving queued text, read live from the Pi session. The chip's
   * rehydration source (ticket 04): a reload with a pending follow-up
   * restores it from here, and queue-update events keep it in sync after.
   * Empty when nothing is armed.
   */
  pending: PendingQueues;
}

/**
 * Defensive read of the Pi queues: test doubles and older sessions may
 * lack the getters, and a throwing getter must never fail the snapshot.
 */
function readPendingQueues(session: {
  getSteeringMessages?: () => readonly unknown[];
  getFollowUpMessages?: () => readonly unknown[];
}): PendingQueues {
  const read = (fn?: () => readonly unknown[]): string[] => {
    try {
      const value = fn?.call(session);
      return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : [];
    } catch {
      return [];
    }
  };
  return {
    steering: read(session.getSteeringMessages),
    followUp: read(session.getFollowUpMessages),
  };
}

export class SessionQueries {
  constructor(private readonly registry: SessionRegistry) {}

  private sessionProjectCwd(sessionId: string): string {
    const entry = this.registry.getRaw(sessionId);
    if (!entry) throw new Error("Session not found");
    const cwd = sessionCwd(entry);
    if (!cwd) throw new Error("Session not found");
    return cwd;
  }

  async getSessionMessages(
    sessionId: string,
    project?: string,
    parentSessionId?: string,
  ): Promise<Array<any>> {
    const log = getWorkerLogger("worker");
    let entry = this.registry.get(sessionId, parentSessionId);

    if (!entry && project) {
      log.info("session.messages_load_disk", { sessionId });
      const loaded = await this.registry.loadSessionFromDisk(
        sessionId,
        project,
        undefined,
        parentSessionId ? { sessionsSubdir: "subagents", parentSessionId } : undefined,
      );
      if (loaded) {
        entry = loaded;
      }
    }

    if (!entry) {
      log.info("session.messages_not_found", { sessionId });
      return [];
    }

    return convertPiMessagesToAgui(entry.runtime.session.messages);
  }

  getSessionSkills(sessionId: string): CodingAgentSkill[] {
    const entry = this.registry.getRaw(sessionId);
    if (!entry) {
      throw new Error("Session not found");
    }
    return entry.runtime.session.resourceLoader
      .getSkills()
      .skills.map(({ name, description }) => ({ name, description }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getSessionPrompts(sessionId: string): PromptSummary[] {
    return getProjectPrompts(this.sessionProjectCwd(sessionId));
  }

  resolvePrompt(
    sessionId: string,
    promptName: string,
    values: Record<string, string>,
  ): { text: string } {
    return resolveProjectPrompt(this.sessionProjectCwd(sessionId), promptName, values);
  }

  async getSessionModel(
    sessionId: string,
    project?: string,
  ): Promise<{ providerId: string; modelId: string } | null> {
    const log = getWorkerLogger("worker");
    let entry = this.registry.getRaw(sessionId);

    if (!entry && project) {
      log.info("session.model_load_disk", { sessionId });
      entry = await this.registry.loadSessionFromDisk(sessionId, project);
    }

    if (!entry) {
      log.info("session.model_not_found", { sessionId });
      return null;
    }

    const model = entry.runtime.session.model;
    if (!model) return null;
    return { providerId: model.provider, modelId: model.id };
  }

  async getSessionThinkingLevel(
    sessionId: string,
    project?: string,
  ): Promise<{ level: ThinkingLevel; levels: ThinkingLevel[] } | null> {
    const log = getWorkerLogger("worker");
    let entry = this.registry.getRaw(sessionId);

    if (!entry && project) {
      log.info("session.thinking_level_load_disk", { sessionId });
      entry = await this.registry.loadSessionFromDisk(sessionId, project);
    }

    if (!entry) {
      log.info("session.thinking_level_not_found", { sessionId });
      return null;
    }

    const session = entry.runtime.session;
    return {
      level: session.thinkingLevel,
      levels: session.getAvailableThinkingLevels(),
    };
  }

  async getSessionStatus(sessionId: string, parentSessionId?: string): Promise<SessionStatus> {
    const log = getWorkerLogger("worker");
    const entry = this.registry.get(sessionId, parentSessionId);
    if (!entry) {
      log.info("session.status_not_found", { sessionId });
      return { running: false };
    }
    if (entry.runtime.session.isStreaming) {
      return { running: true };
    }
    return { running: false };
  }

  async getSessionSnapshot(
    sessionId: string,
    project?: string,
    parentSessionId?: string,
  ): Promise<SessionSnapshot> {
    const messages = await this.getSessionMessages(sessionId, project, parentSessionId);
    const entry = this.registry.get(sessionId, parentSessionId);
    if (!entry) {
      return { messages, cursor: null, running: false, pending: { steering: [], followUp: [] } };
    }

    const eventLog = ensureEventLog(entry);
    const seq = entry.snapshotCursorSeq ?? eventLog.lastSeq;
    return {
      messages,
      cursor: { epoch: eventLog.epoch, seq },
      running: entry.runtime.session.isStreaming || !!entry.activeRun,
      pending: readPendingQueues(entry.runtime.session),
    };
  }

  async getSubagentSessionForToolCall(
    parentSessionId: string,
    toolCallId: string,
  ): Promise<{ subSessionId: string }> {
    const log = getWorkerLogger("worker");
    const parent = this.registry.getRaw(parentSessionId);
    if (!parent) {
      log.info("subagent.lookup_parent_not_found", { parentSessionId, toolCallId });
      throw new Error("Parent session not found");
    }

    const registered = [...this.registry.entries()].find(
      (e) => e.parentSessionId === parentSessionId && e.parentToolCallId === toolCallId,
    );
    if (registered) {
      return { subSessionId: registered.sessionId };
    }

    const toolResult = (parent.runtime.session.messages as ReadonlyArray<any>).find(
      (msg) => msg?.role === "toolResult" && msg.toolCallId === toolCallId,
    );
    const subSessionId = (toolResult as any)?.details?.subSessionId;
    if (typeof subSessionId !== "string" || !subSessionId) {
      log.info("subagent.lookup_not_found", { parentSessionId, toolCallId });
      throw new Error("Subagent session not found for tool call");
    }

    const rehydrated = await this.registry.loadSessionFromDisk(
      subSessionId,
      parent.project,
      undefined,
      {
        sessionsSubdir: "subagents",
        parentSessionId,
        parentToolCallId: toolCallId,
      },
    );
    if (!rehydrated) {
      log.info("subagent.lookup_rehydrate_failed", { parentSessionId, toolCallId, subSessionId });
      throw new Error("Subagent session not found for tool call");
    }
    return { subSessionId: rehydrated.sessionId };
  }
}
