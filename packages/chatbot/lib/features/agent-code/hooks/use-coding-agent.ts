"use client";

import { useMemo, useCallback, useSyncExternalStore } from "react";
import {
  HttpAgent,
  EventType,
  type BaseEvent,
  type Message,
} from "@ag-ui/client";

export type AgentStatus =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "writing" }
  | { kind: "tool_calling"; toolName: string };

export interface UseCodingAgentArgs {
  project: string;
  sessionId: string;
  modelId: string;
  initialMessages: Message[];
}

export interface UseCodingAgentResult {
  messages: Message[];
  isRunning: boolean;
  sendMessage: (content: string) => Promise<void>;
  status: AgentStatus;
  error: string | null;
}

export function statusFromEvent(event: BaseEvent, current: AgentStatus): AgentStatus {
  switch (event.type) {
    case EventType.REASONING_START:
    case EventType.REASONING_MESSAGE_START:
      return { kind: "thinking" };
    case EventType.TEXT_MESSAGE_START:
    case EventType.TEXT_MESSAGE_CONTENT:
      return { kind: "writing" };
    case EventType.TOOL_CALL_START: {
      const name = (event as { toolCallName?: string }).toolCallName ?? "tool";
      return { kind: "tool_calling", toolName: name };
    }
    case EventType.TOOL_CALL_END:
    case EventType.TOOL_CALL_RESULT:
      // Tool finished — revert to "thinking" since the agent will
      // process the result and decide what to do next. If the run
      // ends immediately after, RUN_FINISHED will set idle.
      return { kind: "thinking" };
    case EventType.TEXT_MESSAGE_END:
      // Message complete — agent may continue with tools or finish
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
  const agent = useMemo(
    () => new HttpAgent({ url: "/api/agent/code", threadId: sessionId, initialMessages }),
    [sessionId],
  );

  // Create a stable store wrapper for useSyncExternalStore.
  const store = useMemo(() => {
    let snapshot = {
      messages: agent.messages,
      isRunning: agent.isRunning,
      status: { kind: "idle" } as AgentStatus,
      error: null as string | null,
    };

    const listeners = new Set<() => void>();

    const emit = () => {
      listeners.forEach((l) => l());
    };

    const updateSnapshot = (updater: (prev: typeof snapshot) => Partial<typeof snapshot>) => {
      snapshot = { ...snapshot, ...updater(snapshot) };
      emit();
    };

    let subscription: { unsubscribe: () => void } | null = null;

    return {
      subscribe(listener: () => void) {
        listeners.add(listener);
        if (listeners.size === 1) {
          subscription = agent.subscribe({
            onRunStartedEvent: () => {
              updateSnapshot(() => ({ isRunning: true, error: null }));
            },
            onEvent: ({ event }) => {
              updateSnapshot((prev) => ({ status: statusFromEvent(event, prev.status) }));
            },
            onRunFinishedEvent: () => {
              updateSnapshot(() => ({ isRunning: false, status: { kind: "idle" } }));
            },
            onRunFinalized: () => {
              updateSnapshot(() => ({ messages: [...agent.messages] }));
            },
            onRunFailed: ({ error: err }) => {
              updateSnapshot(() => ({
                isRunning: false,
                status: { kind: "idle" },
                error: err.message,
                messages: [...agent.messages],
              }));
            },
            onMessagesChanged: () => {
              updateSnapshot(() => ({ messages: [...agent.messages] }));
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
      update: updateSnapshot,
    };
  }, [agent]);

  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

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
        status: { kind: "thinking" },
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
              store.update(() => ({
                isRunning: false,
                status: { kind: "idle" },
                error: err.message,
              }));
            },
            onRunFinalized: () => {
              store.update(() => ({
                isRunning: false,
                status: { kind: "idle" },
              }));
            },
          },
        );
      } catch (err) {
        store.update(() => ({
          isRunning: false,
          status: { kind: "idle" },
          error: (err as Error).message,
        }));
      }
    },
    [agent, project, sessionId, modelId, store],
  );

  return {
    messages: state.messages,
    isRunning: state.isRunning,
    sendMessage,
    status: state.status,
    error: state.error,
  };
}
