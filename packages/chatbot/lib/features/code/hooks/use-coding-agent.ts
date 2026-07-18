"use client";

import { useEffect, useMemo, useCallback, useSyncExternalStore, useRef } from "react";
import {
  EventType,
  type BaseEvent,
  type Message,
} from "@ag-ui/client";
import { ConnectableHttpAgent } from "@/lib/features/code/connectable-http-agent";
import { writeClientTrace } from "@/lib/features/code/client-trace";
import { groupItems } from "@/lib/features/code/group-items";
import type { AgentItem } from "@/lib/features/code/types";

export type AgentStatus =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "writing" }
  | { kind: "tool_calling"; toolName: string; toolCallId?: string }
  | { kind: "step_running"; stepName: string };

export interface UseCodingAgentArgs {
  project: string;
  sessionId: string;
  modelId: string;
}

export interface UseCodingAgentResult {
  messages: Message[];
  items: AgentItem[];
  toolErrors: ReadonlyMap<string, true>;
  isRunning: boolean;
  isLoading: boolean;
  sendMessage: (content: string) => Promise<void>;
  status: AgentStatus;
  error: string | null;
  cancel: () => Promise<void>;
}

interface SessionCursor {
  epoch: string;
  seq: number;
}

interface CursorEvent {
  cursor: SessionCursor;
  terminal: boolean;
}

interface SessionSnapshot {
  messages: Message[];
  cursor: SessionCursor | null;
  running: boolean;
}

export function statusFromEvent(
  event: BaseEvent,
  current: AgentStatus,
): AgentStatus {
  switch (event.type) {
    case EventType.STEP_STARTED: {
      const name = (event as { stepName?: string }).stepName ?? "step";
      return { kind: "step_running", stepName: name };
    }
    case EventType.STEP_FINISHED:
      return { kind: "thinking" };
    case EventType.REASONING_START:
    case EventType.REASONING_MESSAGE_START:
      return { kind: "thinking" };
    case EventType.TEXT_MESSAGE_START:
    case EventType.TEXT_MESSAGE_CONTENT:
      return { kind: "writing" };
    case EventType.TOOL_CALL_START: {
      const e = event as { toolCallName?: string; toolCallId?: string };
      return {
        kind: "tool_calling",
        toolName: e.toolCallName ?? "tool",
        toolCallId: e.toolCallId,
      };
    }
    case EventType.TOOL_CALL_END:
    case EventType.TOOL_CALL_RESULT:
      return { kind: "thinking" };
    case EventType.TEXT_MESSAGE_END:
      return current;
    case EventType.RUN_FINISHED:
    case EventType.RUN_ERROR:
      return { kind: "idle" };
    default:
      return current;
  }
}

function getEventRunId(event: BaseEvent): string | undefined {
  return (event as { runId?: string }).runId;
}

function summarizeClientEvent(event: BaseEvent): Record<string, unknown> {
  switch (event.type) {
    case EventType.MESSAGES_SNAPSHOT:
      return {
        type: event.type,
        messageCount: ((event as { messages?: Message[] }).messages ?? []).length,
      };
    case EventType.STEP_FINISHED:
      return {
        type: event.type,
        stepName: (event as { stepName?: string }).stepName,
      };
    case EventType.RUN_ERROR:
      return {
        type: event.type,
        message: (event as { message?: string }).message,
      };
    default:
      return { type: event.type };
  }
}

function shouldTraceClientEvent(event: BaseEvent): boolean {
  return (
    event.type === EventType.RUN_STARTED ||
    event.type === EventType.MESSAGES_SNAPSHOT ||
    event.type === EventType.STEP_FINISHED ||
    event.type === EventType.RUN_FINISHED ||
    event.type === EventType.RUN_ERROR
  );
}

function cursorFromEvent(event: BaseEvent): CursorEvent | null {
  if (
    event.type !== EventType.CUSTOM ||
    (event as { name?: string }).name !== "coding_agent_cursor"
  ) {
    return null;
  }
  const value = (event as { value?: unknown }).value;
  if (!value || typeof value !== "object") return null;
  const { epoch, seq, terminal } = value as {
    epoch?: unknown;
    seq?: unknown;
    terminal?: unknown;
  };
  return typeof epoch === "string" && typeof seq === "number"
    ? { cursor: { epoch, seq }, terminal: terminal === true }
    : null;
}

function isCursorResetError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: unknown }).status === 409
  ) || (
    err instanceof Error && err.message.includes("Cursor reset required")
  );
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name.toLowerCase();
  const msg = err.message.toLowerCase();
  return name === "aborterror" || /aborted|fetch is aborted/.test(msg);
}

// When we abort our own fetch (cut-on-hide, unmount), @ag-ui/client does not
// reject the run promise: it converts the AbortError into an in-band RUN_ERROR
// event with code "abort" and completes the stream. Only locally aborted
// requests carry that code — the worker never stamps `code` on its RUN_ERROR
// events — so this cleanly separates a deliberate cut from a genuine failure.
function isLocalAbortRunError(event: BaseEvent): boolean {
  return (
    event.type === EventType.RUN_ERROR &&
    (event as { code?: string }).code === "abort"
  );
}

const MAX_CONNECT_ATTEMPTS = 4; // 1 initial + 3 retries
const CONNECT_BACKOFF_MS = [300, 600, 1200]; // delay before retry attempts 1, 2, 3

export function useCodingAgent({
  project,
  sessionId,
  modelId,
}: UseCodingAgentArgs): UseCodingAgentResult {
  const agentRef = useRef<{ sessionId: string; agent: ConnectableHttpAgent } | null>(null);
  if (agentRef.current === null || agentRef.current.sessionId !== sessionId) {
    agentRef.current = {
      sessionId,
      agent: new ConnectableHttpAgent({
        runUrl: "/api/agent/code",
        connectUrl: "/api/agent/code/connect",
        threadId: sessionId,
      }),
    };
  }
  const agent = agentRef.current.agent;
  const cursorRef = useRef<SessionCursor | null>(null);
  const pendingTerminalCursorRef = useRef<SessionCursor | null>(null);
  const shouldReconnectRef = useRef(false);

  const store = useMemo(() => {
    const currentAgent = agentRef.current?.agent;
    if (!currentAgent) {
      throw new Error("HttpAgent not initialized");
    }
    let snapshot = {
      messages: currentAgent.messages,
      isRunning: currentAgent.isRunning,
      isLoading: true,
      status: { kind: "idle" } as AgentStatus,
      error: null as string | null,
      toolErrors: new Map<string, true>() as ReadonlyMap<string, true>,
      toolTimings: new Map<
        string,
        { startedAt: number; finishedAt?: number }
      >(),
    };

    const serverSnapshot = {
      messages: [] as Message[],
      isRunning: false,
      isLoading: true,
      status: { kind: "idle" } as AgentStatus,
      error: null as string | null,
      toolErrors: new Map<string, true>() as ReadonlyMap<string, true>,
      toolTimings: new Map<
        string,
        { startedAt: number; finishedAt?: number }
      >(),
    };

    const listeners = new Set<() => void>();
    const emit = () => listeners.forEach((l) => l());

    const update = (u: (prev: typeof snapshot) => Partial<typeof snapshot>) => {
      snapshot = { ...snapshot, ...u(snapshot) };
      emit();
    };

    let subscription: { unsubscribe: () => void } | null = null;
    let currentTraceRunId: string | null = null;

    return {
      subscribe(listener: () => void) {
        listeners.add(listener);
        if (listeners.size === 1) {
          subscription = currentAgent.subscribe({
            onRunStartedEvent: () => {
              shouldReconnectRef.current = true;
              update(() => ({
                isRunning: true,
                error: null,
                toolErrors: new Map(),
                toolTimings: new Map(),
              }));
            },
            onEvent: ({ event }) => {
              if (isLocalAbortRunError(event)) {
                // Not a real terminal event: the run is still active on the
                // worker. Leave shouldReconnectRef/status/cursor untouched so
                // the next visibility:visible can resume it.
                writeClientTrace({
                  runId: getEventRunId(event) ?? currentTraceRunId ?? sessionId,
                  sessionId,
                  eventName: "client.run_error.abort_ignored",
                  payload: {
                    message: (event as { message?: string }).message,
                  },
                });
                return;
              }
              const cursor = cursorFromEvent(event);
              if (cursor) {
                if (cursor.terminal) {
                  pendingTerminalCursorRef.current = cursor.cursor;
                } else {
                  cursorRef.current = cursor.cursor;
                }
              }
              if (
                event.type === EventType.RUN_FINISHED ||
                event.type === EventType.RUN_ERROR
              ) {
                if (pendingTerminalCursorRef.current) {
                  cursorRef.current = pendingTerminalCursorRef.current;
                  pendingTerminalCursorRef.current = null;
                }
                shouldReconnectRef.current = false;
              }
              const eventRunId = getEventRunId(event);
              if (eventRunId) currentTraceRunId = eventRunId;
              if (shouldTraceClientEvent(event)) {
                writeClientTrace({
                  runId: eventRunId ?? currentTraceRunId ?? sessionId,
                  sessionId,
                  eventName: `client.event.${event.type}`,
                  payload: summarizeClientEvent(event),
                });
              }
              update((prev) => {
                const next: Partial<typeof snapshot> = {
                  status: statusFromEvent(event, prev.status),
                };
                if (
                  event.type === EventType.STEP_STARTED ||
                  event.type === EventType.STEP_FINISHED
                ) {
                  const raw = (
                    event as {
                      rawEvent?: { toolCallId?: string; isError?: boolean };
                      timestamp?: number;
                    }
                  ).rawEvent;
                  const ts = (event as { timestamp?: number }).timestamp;
                  const id = raw?.toolCallId;
                  if (id) {
                    const m = new Map(prev.toolTimings);
                    const existing = m.get(id);
                    if (event.type === EventType.STEP_STARTED) {
                      m.set(id, {
                        startedAt: ts ?? Date.now(),
                        finishedAt: existing?.finishedAt,
                      });
                    } else {
                      if (existing) {
                        m.set(id, {
                          startedAt: existing.startedAt,
                          finishedAt: ts ?? Date.now(),
                        });
                      } else {
                        m.set(id, {
                          startedAt: ts ?? Date.now(),
                          finishedAt: ts ?? Date.now(),
                        });
                      }
                    }
                    next.toolTimings = m;
                  }
                  if (
                    event.type === EventType.STEP_FINISHED &&
                    raw?.toolCallId &&
                    raw.isError === true
                  ) {
                    const errs = new Map(prev.toolErrors);
                    errs.set(raw.toolCallId, true);
                    next.toolErrors = errs;
                  }
                }
                return next;
              });
            },
            onRunFinishedEvent: () => {
              shouldReconnectRef.current = false;
              update(() => ({ isRunning: false, status: { kind: "idle" } }));
            },
            onRunFinalized: () => {
              update(() => ({ messages: [...currentAgent.messages] }));
            },
            onRunFailed: ({ error: err }) => {
              if (isAbortError(err)) {
                // Deliberate local cut — keep the running state intact for
                // the reconnect on visibility:visible.
                writeClientTrace({
                  runId: currentTraceRunId ?? sessionId,
                  sessionId,
                  eventName: "client.run_failed.abort_ignored",
                  payload: { message: err.message },
                });
                return;
              }
              writeClientTrace({
                runId: currentTraceRunId ?? sessionId,
                sessionId,
                eventName: "client.run_failed",
                level: "error",
                payload: { message: err.message },
              });
              update(() => ({
                isRunning: false,
                status: { kind: "idle" },
                error: err.message,
                messages: [...currentAgent.messages],
              }));
            },
            onMessagesChanged: () => {
              update(() => ({ messages: [...currentAgent.messages] }));
            },
            onMessagesSnapshotEvent: ({ event }) => {
              writeClientTrace({
                runId: currentTraceRunId ?? sessionId,
                sessionId,
                eventName: "client.messages_snapshot_applied",
                payload: { messageCount: event.messages.length },
              });
              update(() => ({
                messages: event.messages,
                error: null,
              }));
            },
          });
        }
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0 && subscription) {
            subscription.unsubscribe();
            subscription = null;
          }
        };
      },
      getSnapshot() {
        return snapshot;
      },
      getServerSnapshot() {
        return serverSnapshot;
      },
      update,
    };
  }, [sessionId]);

  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  useEffect(() => {
    let cancelled = false;
    let retriedAfterCursorReset = false;
    let connecting = false;

    const connect = async (cursor: SessionCursor, attempt = 0) => {
      if (cancelled || connecting) return;
      connecting = true;
      let reloadAfterCursorReset = false;
      const runId = crypto.randomUUID();
      writeClientTrace({
        runId,
        sessionId,
        eventName: "client.connect.start",
        payload: { project, cursor, attempt },
      });
      try {
        await agent.connectAgent({
          runId,
          context: [
            { description: "project", value: project },
            { description: "sessionId", value: sessionId },
          ],
          forwardedProps: { afterSeq: cursor.seq, epoch: cursor.epoch },
        });
        writeClientTrace({ runId, sessionId, eventName: "client.connect.complete" });
      } catch (err) {
        if (cancelled) return;
        if (isCursorResetError(err) && !retriedAfterCursorReset) {
          retriedAfterCursorReset = true;
          reloadAfterCursorReset = true;
        } else if (isAbortError(err)) {
          // Deliberate cut (e.g. tab hidden). Swallow silently.
          writeClientTrace({
            runId,
            sessionId,
            eventName: "client.connect.aborted",
            payload: { attempt },
          });
        } else if (attempt + 1 < MAX_CONNECT_ATTEMPTS) {
          const delay = CONNECT_BACKOFF_MS[attempt];
          writeClientTrace({
            runId,
            sessionId,
            eventName: "client.connect.retry",
            payload: { attempt, delayMs: delay, next: attempt + 1 },
          });
          cancelPendingRetry();
          pendingRetryTimer = setTimeout(() => {
            pendingRetryTimer = null;
            void connect(cursor, attempt + 1);
          }, delay);
        } else {
          writeClientTrace({
            runId,
            sessionId,
            eventName: "client.connect.failed",
            level: "error",
            payload: {
              message: err instanceof Error ? err.message : String(err),
              attempts: MAX_CONNECT_ATTEMPTS,
            },
          });
          if (!cancelled) {
            store.update(() => ({
              isRunning: false,
              status: { kind: "idle" },
              error: err instanceof Error ? err.message : String(err),
            }));
          }
        }
      } finally {
        connecting = false;
      }
      if (reloadAfterCursorReset && !cancelled) {
        await loadSnapshot();
      }
    };

    const loadSnapshot = async () => {
      try {
        const response = await fetch(
          `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/snapshot`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load coding-agent session: ${response.status}`);
        }
        const snapshot = await response.json() as SessionSnapshot;
        if (cancelled) return;

        agent.setMessages(snapshot.messages);
        cursorRef.current = snapshot.cursor;
        pendingTerminalCursorRef.current = null;
        shouldReconnectRef.current = snapshot.running;
        store.update(() => ({
          messages: [...agent.messages],
          isLoading: false,
          isRunning: snapshot.running,
          status: snapshot.running ? { kind: "thinking" } : { kind: "idle" },
          error: null,
          toolErrors: new Map(),
          toolTimings: new Map(),
        }));
        if (snapshot.running && snapshot.cursor) {
          await connect(snapshot.cursor);
        }
      } catch (err) {
        if (cancelled) return;
        store.update(() => ({
          isLoading: false,
          isRunning: false,
          status: { kind: "idle" },
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    };

    // Guards re-entrancy into ensureConnected specifically. Deliberately
    // separate from `connecting` (which connect() owns): a zombie stream
    // (page frozen mid-request) leaves `connecting` stuck at true forever,
    // since connect()'s awaited call never settles on its own — exactly the
    // case ensureConnected exists to break out of via detachActiveRun().
    let recovering = false;

    let pendingRetryTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelPendingRetry = () => {
      if (pendingRetryTimer) {
        clearTimeout(pendingRetryTimer);
        pendingRetryTimer = null;
      }
    };

    // Kills any zombie stream (e.g. a page frozen mid-request by the mobile OS)
    // before resuming, then resumes from the last acknowledged cursor.
    const ensureConnected = async (reason: string) => {
      if (cancelled || recovering) return;
      if (!shouldReconnectRef.current) return;
      cancelPendingRetry();
      const cursor = cursorRef.current;
      if (!cursor) {
        // Run started but no cursor event has arrived yet (e.g. tab was
        // hidden before RUN_STARTED). Fall back to snapshot, which fetches
        // a fresh cursor and will reconnect itself if still running.
        writeClientTrace({
          runId: crypto.randomUUID(),
          sessionId,
          eventName: "client.reconnect.trigger",
          payload: { reason, fallback: "loadSnapshot", reason_detail: "null_cursor" },
        });
        recovering = true;
        try {
          await loadSnapshot();
        } finally {
          recovering = false;
        }
        return;
      }
      recovering = true;
      try {
        writeClientTrace({
          runId: crypto.randomUUID(),
          sessionId,
          eventName: "client.reconnect.trigger",
          payload: { reason },
        });
        await agent.detachActiveRun();
        if (cancelled) return;
        await connect(cursor);
      } finally {
        recovering = false;
      }
    };

    const cutStream = (reason: string) => {
      if (!shouldReconnectRef.current) return;
      cancelPendingRetry();
      writeClientTrace({
        runId: crypto.randomUUID(),
        sessionId,
        eventName: "client.stream.cut",
        payload: { reason },
      });
      agent.abortRun();
    };

    const reconnectNow = (reason: string) => {
      if (cancelled || recovering) return;
      if (!shouldReconnectRef.current) return;
      void ensureConnected(reason);
    };

    void loadSnapshot();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        cutStream("visibility:hidden");
        return;
      }
      reconnectNow("visibility:visible");
    };
    // iOS Safari can restore a frozen page from bfcache without re-running
    // effects or firing visibilitychange — pageshow is the reliable signal.
    const handlePageShow = () => {
      reconnectNow("pageshow");
    };
    const handleOnline = () => {
      if (document.visibilityState !== "visible") return;
      reconnectNow("online");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("online", handleOnline);
    return () => {
      cancelled = true;
      cancelPendingRetry();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("online", handleOnline);
      void agent.abortRun();
    };
  }, [agent, project, sessionId, store]);

  const items = useMemo(
    () => groupItems(state.messages, state.toolErrors, state.toolTimings),
    [state.messages, state.toolErrors, state.toolTimings],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (state.isLoading) {
        store.update(() => ({ error: "Coding agent session is still loading" }));
        return;
      }
      if (!modelId) {
        store.update(() => ({ error: "No model selected" }));
        return;
      }
      const runId = crypto.randomUUID();
      writeClientTrace({
        runId,
        sessionId,
        eventName: "client.run.start",
        payload: { project, modelId, promptLength: content.length },
      });
      store.update(() => ({
        error: null,
        isRunning: true,
        status: { kind: "thinking" } as AgentStatus,
      }));
      shouldReconnectRef.current = true;
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content });
      try {
        await agent.runAgent(
          {
            runId,
            context: [
              { description: "project", value: project },
              { description: "sessionId", value: sessionId },
              { description: "modelId", value: modelId },
            ],
          },
          {
            onRunFailed: ({ error: err }) => {
              writeClientTrace({
                runId,
                sessionId,
                eventName: "client.run.failed_callback",
                level: "error",
                payload: { message: err.message },
              });
            },
            onRunFinalized: () => {
              writeClientTrace({
                runId,
                sessionId,
                eventName: "client.run.finalized",
                payload: { messageCount: agent.messages.length },
              });
            },
          },
        );
        writeClientTrace({
          runId,
          sessionId,
          eventName: "client.run.complete",
        });
      } catch (err) {
        writeClientTrace({
          runId,
          sessionId,
          eventName: "client.run.threw",
          level: "error",
          payload: { message: err instanceof Error ? err.message : String(err) },
        });
      }
    },
    [agent, project, sessionId, modelId, state.isLoading, store],
  );

  return {
    messages: state.messages,
    items,
    toolErrors: state.toolErrors,
    isRunning: state.isRunning,
    isLoading: state.isLoading,
    sendMessage,
    status: state.status,
    error: state.error,
    cancel: async () => {
      const runId = crypto.randomUUID();
      writeClientTrace({
        runId,
        sessionId,
        eventName: "client.cancel.request",
      });
      await fetch("/api/agent/code/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    },
  };
}
