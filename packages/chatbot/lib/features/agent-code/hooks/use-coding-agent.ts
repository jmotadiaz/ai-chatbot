"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
}: UseCodingAgentArgs): UseCodingAgentResult {
  const agent = useMemo(
    () => new HttpAgent({ url: "/api/agent/code", threadId: sessionId }),
    [sessionId],
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<AgentStatus>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  // Load existing messages on mount and seed the agent's internal buffer.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/agent/code/${encodeURIComponent(project)}/sessions/${encodeURIComponent(sessionId)}/messages`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages?: Array<{ role: string; content: string }>;
        };
        if (cancelled) return;
        const loaded: Message[] = (data.messages ?? []).map((m, i) => ({
          id: `loaded-${i}`,
          role: m.role as Message["role"],
          content: m.content,
        })) as Message[];
        // Server returns only { role, content }; toolCalls and IDs are not preserved across reloads.
        // Trust boundary: server's session-store filter (session-manager.ts:293-298).
        /* eslint-disable @typescript-eslint/no-explicit-any */
        agent.addMessages(
          loaded.map((m) => ({ id: m.id, role: m.role, content: m.content })) as any,
        );
        /* eslint-enable @typescript-eslint/no-explicit-any */
        setMessages(loaded);
      } catch {
        // non-fatal; user can start fresh
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project, sessionId, agent]);

  // Subscribe to the agent so we mirror its messages[] into local state.
  useEffect(() => {
    const subscription = agent.subscribe({
      onRunStartedEvent: () => {
        setIsRunning(true);
        setError(null);
      },
      onEvent: ({ event }) => {
        setStatus((s) => statusFromEvent(event, s));
      },
      onRunFinishedEvent: () => {
        setIsRunning(false);
        setStatus({ kind: "idle" });
      },
      onRunFinalized: () => {
        setMessages([...agent.messages]);
      },
      onRunFailed: ({ error: err }) => {
        setIsRunning(false);
        setStatus({ kind: "idle" });
        setError(err.message);
        setMessages([...agent.messages]);
      },
      onMessagesChanged: () => {
        setMessages([...agent.messages]);
      },
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [agent]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!modelId) {
        setError("No model selected");
        return;
      }
      const runId = crypto.randomUUID();
      setError(null);
      setIsRunning(true);
      setStatus({ kind: "thinking" });
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
              setIsRunning(false);
              setStatus({ kind: "idle" });
              setError(err.message);
            },
            onRunFinalized: () => {
              setIsRunning(false);
              setStatus({ kind: "idle" });
            },
          },
        );
      } catch (err) {
        setIsRunning(false);
        setStatus({ kind: "idle" });
        setError((err as Error).message);
      }
    },
    [agent, project, sessionId, modelId],
  );

  return { messages, isRunning, sendMessage, status, error };
}
