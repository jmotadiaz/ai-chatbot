import { getTraceLogger } from "tracing";
import { SessionEventLog } from "./event-log";
import { PiToAguiTranslator, type BaseEvent } from "./pi-to-agui-translator";

interface SubagentCollectorEntry {
  sessionId: string;
  runtime: { session: { subscribe: (cb: (e: unknown) => void) => () => void } };
  eventLog: SessionEventLog;
  snapshotCursorSeq?: number;
}

/**
 * Slim run collector for subagent sessions: Pi events → AG-UI → the child's
 * own event log. No files-changed diff (the parent turn's diff covers the
 * shared-cwd case; worktree runs are a documented blind spot) and no
 * MESSAGES_SNAPSHOT (the dedicated view always starts from getSessionSnapshot).
 */
export function startSubagentCollector(
  entry: SubagentCollectorEntry,
  runId: string,
): () => void {
  const log = getTraceLogger("worker");
  const translator = new PiToAguiTranslator({ threadId: entry.sessionId, runId });

  const unsubscribe = entry.runtime.session.subscribe((rawEvent) => {
    const event = rawEvent as { type: string };
    for (const aguiEvent of translator.translate(rawEvent as never)) {
      entry.eventLog.append(aguiEvent as BaseEvent);
    }
    if (event.type === "message_end" || event.type === "tool_execution_end") {
      entry.snapshotCursorSeq = entry.eventLog.lastSeq;
    }
  });

  return () => {
    unsubscribe();
    log.info("subagent.collector_stopped", { sessionId: entry.sessionId, runId });
  };
}
