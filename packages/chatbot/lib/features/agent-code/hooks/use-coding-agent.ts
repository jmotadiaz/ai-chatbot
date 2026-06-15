"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { HttpAgent, EventType, type BaseEvent } from "@ag-ui/client";

export interface UseCodingAgentArgs {
  project: string;
  sessionId: string;
  modelId: string;
}

export interface UseCodingAgentResult {
  messages: Array<{ role: string; content: string }>;
  isRunning: boolean;
  sendMessage: (content: string) => Promise<void>;
}

async function postTraceEvent(
  runId: string,
  sessionId: string,
  eventName: string,
  level: string,
  payload?: unknown,
) {
  try {
    await fetch("/api/agent/code/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, sessionId, eventName, level, payload }),
    });
  } catch {
    // trace failure is non-fatal
  }
}

export function useCodingAgent({
  project,
  sessionId,
  modelId,
}: UseCodingAgentArgs): UseCodingAgentResult {
  const agent = useMemo(
    () =>
      new HttpAgent({
        url: "/api/agent/code",
        threadId: sessionId,
      }),
    [sessionId],
  );

  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Load existing messages from the server on mount
  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      try {
        const res = await fetch(
          `/api/agent/code/${encodeURIComponent(project)}/sessions/${encodeURIComponent(sessionId)}/messages`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const msgs: Array<{ role: string; content: string }> = data.messages ?? [];
        if (msgs.length > 0) {
          setMessages(msgs);
          // Also populate the agent's internal message buffer so subsequent runs
          // include the full conversation history when calling the API.
          /* eslint-disable @typescript-eslint/no-explicit-any */
          agent.addMessages(
            msgs.map((m) => ({ id: crypto.randomUUID(), role: m.role, content: m.content })) as any,
          );
          /* eslint-enable @typescript-eslint/no-explicit-any */
        }
      } catch {
        // fetch failure is non-fatal; user can start fresh
      }
    }

    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [project, sessionId, agent]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!modelId) {
        console.error("[CodingAgent] Cannot send message: no model selected");
        return;
      }

      const runId = crypto.randomUUID();
      postTraceEvent(runId, sessionId, "sendMessage", "info", { contentLength: content.length });

      setMessages((prev) => [...prev, { role: "user", content }]);
      setIsRunning(true);

      let assistantContent = "";

      agent.addMessage({ id: crypto.randomUUID(), role: "user", content });

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
          onEvent: ({ event }: { event: BaseEvent }) => {
            postTraceEvent(runId, sessionId, "event.received", "debug", {
              type: event.type,
            });
            if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
              assistantContent += (event as unknown as { delta: string }).delta;
            }
          },
          onRunFailed: () => {
            postTraceEvent(runId, sessionId, "run.failed", "error");
            setIsRunning(false);
          },
          onRunFinalized: () => {
            postTraceEvent(runId, sessionId, "run.finalized", "info", {
              contentLength: assistantContent.length,
            });
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: assistantContent },
            ]);
            setIsRunning(false);
          },
        },
      );
    },
    [agent, project, sessionId, modelId],
  );

  return { messages, isRunning, sendMessage };
}
