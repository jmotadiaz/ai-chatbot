"use client";

import { useEffect, useMemo, useCallback, useSyncExternalStore, useRef } from "react";
import {
  EventType,
  type BaseEvent,
  type Message,
} from "@ag-ui/client";
import { ConnectableHttpAgent } from "@/lib/features/code/connectable-http-agent";
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
  initialMessages: Message[];
}

export interface UseCodingAgentResult {
  messages: Message[];
  items: AgentItem[];
  toolErrors: ReadonlyMap<string, true>;
  isRunning: boolean;
  sendMessage: (content: string) => Promise<void>;
  status: AgentStatus;
  error: string | null;
  cancel: () => Promise<void>;
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

export function useCodingAgent({
  project,
  sessionId,
  modelId,
  initialMessages,
}: UseCodingAgentArgs): UseCodingAgentResult {
  const agentRef = useRef<{ sessionId: string; agent: ConnectableHttpAgent } | null>(null);
  if (agentRef.current === null || agentRef.current.sessionId !== sessionId) {
    agentRef.current = {
      sessionId,
      agent: new ConnectableHttpAgent({
        runUrl: "/api/agent/code",
        connectUrl: "/api/agent/code/connect",
        threadId: sessionId,
        initialMessages,
      }),
    };
  }
  const agent = agentRef.current.agent;

  useEffect(() => {
    let cancelled = false;
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/agent/code/sessions/${sessionId}/status`);
        if (!res.ok) return;
        const status = (await res.json()) as { running: boolean; piSessionId?: string };
        if (cancelled) return;
        if (status.running) {
          await agent.connectAgent({
            runId: crypto.randomUUID(),
            context: [
              { description: "project", value: project },
              { description: "sessionId", value: sessionId },
              { description: "modelId", value: modelId },
            ],
          });
        }
      } catch {
        // status endpoint failure is non-fatal
      }
    };
    void checkStatus();
    return () => {
      cancelled = true;
    };
  }, [agent, project, sessionId, modelId]);

  const store = useMemo(() => {
    const currentAgent = agentRef.current?.agent;
    if (!currentAgent) {
      throw new Error("HttpAgent not initialized");
    }
    let snapshot = {
      messages: currentAgent.messages,
      isRunning: currentAgent.isRunning,
      status: { kind: "idle" } as AgentStatus,
      error: null as string | null,
      toolErrors: new Map<string, true>() as ReadonlyMap<string, true>,
      toolTimings: new Map<
        string,
        { startedAt: number; finishedAt?: number }
      >(),
    };

    const serverSnapshot = {
      messages: initialMessages,
      isRunning: false,
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

    return {
      subscribe(listener: () => void) {
        listeners.add(listener);
        if (listeners.size === 1) {
          subscription = currentAgent.subscribe({
            onRunStartedEvent: () => {
              update(() => ({
                isRunning: true,
                error: null,
                toolErrors: new Map(),
                toolTimings: new Map(),
              }));
            },
            onEvent: ({ event }) => {
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
              update(() => ({ isRunning: false, status: { kind: "idle" } }));
            },
            onRunFinalized: () => {
              update(() => ({ messages: [...currentAgent.messages] }));
            },
            onRunFailed: ({ error: err }) => {
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
    // sessionId is intentional: the store must be recreated when the
    // session changes so the captured HttpAgent matches the new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  const items = useMemo(
    () => groupItems(state.messages, state.toolErrors, state.toolTimings),
    [state.messages, state.toolErrors, state.toolTimings],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!modelId) {
        store.update(() => ({ error: "No model selected" }));
        return;
      }
      const runId = crypto.randomUUID();
      store.update(() => ({
        error: null,
        isRunning: true,
        status: { kind: "thinking" } as AgentStatus,
      }));
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
              // status updated via onEvent; nothing extra to do here
              void err;
            },
            onRunFinalized: () => {
              // status updated via onEvent
            },
          },
        );
      } catch {
        // error already surfaced via onRunFailed callback
      }
    },
    [agent, project, sessionId, modelId, store],
  );

  return {
    messages: state.messages,
    items,
    toolErrors: state.toolErrors,
    isRunning: state.isRunning,
    sendMessage,
    status: state.status,
    error: state.error,
    cancel: async () => {
      await fetch("/api/agent/code/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    },
  };
}
