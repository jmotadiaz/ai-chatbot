import path from "node:path";
import { config, optional } from "config";
import type { createAgentSessionRuntime } from "@earendil-works/pi-coding-agent";
import { SessionEventLog, type LoggedAguiEvent } from "./event-log";
import { AguiEventType as EventType, type BaseEvent } from "./pi-to-agui-translator";

export interface SessionEntry {
  sessionId: string;
  project: string;
  /** Set for subagent sessions: id of the parent app session that dispatched them. */
  parentSessionId?: string;
  /** Set for subagent sessions: the parent tool call that dispatched them. */
  parentToolCallId?: string;
  runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>;
  eventLog?: SessionEventLog;
  activeRun?: {
    runId: string;
    startSeq: number;
    unsubscribe: () => void;
    sawTerminal: boolean;
  };
  /**
   * eventLog.lastSeq as of the most recently finalized message (user,
   * assistant, or tool result) in this worker's lifetime. A message
   * "finalizes" when Pi pushes it into `session.messages` — which is also
   * exactly when it becomes visible to a fresh `getSessionMessages` /ssr
   * fetch. This is the seq `getSessionSnapshot` reports as the cursor: it
   * points just after the last finalized message, so a client replaying
   * from it only receives the still-partial tail of an in-progress run
   * rather than deltas for messages its snapshot already has in full.
   */
  snapshotCursorSeq?: number;
  /** Model seed for create/reload (Pi needs it to build runtime). */
  pendingModelSeed?: string;
}

export function ensureEventLog(entry: SessionEntry): SessionEventLog {
  entry.eventLog ??= new SessionEventLog();
  return entry.eventLog;
}

export function isTerminalAguiEvent(event: BaseEvent): boolean {
  return event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR;
}

/**
 * Subagent sessions are reachable only through their parent: any accessor
 * must present the matching parentSessionId or the lookup fails closed.
 */
export function assertSessionAccess(entry: SessionEntry, parentSessionId?: string): void {
  if (entry.parentSessionId && entry.parentSessionId !== parentSessionId) {
    throw new Error("Subagent session requires valid parent session id");
  }
}

export function loggedLine(entry: LoggedAguiEvent): string {
  return `${JSON.stringify(entry)}\n`;
}

export function incrementCount(counts: Record<string, number>, key: string | undefined): void {
  if (!key) return;
  counts[key] = (counts[key] ?? 0) + 1;
}

export function appendAguiEvent(
  entry: SessionEntry,
  event: BaseEvent,
  eventCounts?: Record<string, number>,
): LoggedAguiEvent {
  incrementCount(eventCounts ?? {}, event.type);
  const logged = ensureEventLog(entry).append(event);
  if (isTerminalAguiEvent(event) && entry.activeRun) {
    entry.activeRun.sawTerminal = true;
  }
  return logged;
}

export function isValidProjectName(name: string): boolean {
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    return false;
  }
  return /^[a-zA-Z0-9_.-]+$/.test(name);
}

export function resolveProjectPath(root: string, project: string): string {
  if (!isValidProjectName(project)) {
    throw new Error("Invalid project name");
  }
  return path.resolve(root, project);
}

export function sessionCwd(entry: SessionEntry): string | null {
  const root = optional(() => config.codingAgentProjectsRoot());
  if (!root) return null;
  try {
    return resolveProjectPath(root, entry.project);
  } catch {
    return null;
  }
}

export function setActiveRun(
  entry: SessionEntry,
  run: { runId: string; startSeq: number; unsubscribe: () => void },
): void {
  entry.activeRun = { ...run, sawTerminal: false };
}

export function clearActiveRun(entry: SessionEntry): void {
  entry.activeRun = undefined;
}

export function advanceSnapshotCursor(entry: SessionEntry, seq: number): void {
  entry.snapshotCursorSeq = seq;
}
