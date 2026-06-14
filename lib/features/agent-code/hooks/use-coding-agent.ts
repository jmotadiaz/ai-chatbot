"use client";

import { useMemo, useState, useCallback } from "react";
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

export function useCodingAgent({
  project,
  sessionId,
  modelId,
}: UseCodingAgentArgs): UseCodingAgentResult {
  const agent = useMemo(
    () =>
      new HttpAgent({
        url: "/api/agent/code",
      }),
    [],
  );

  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [isRunning, setIsRunning] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      setMessages((prev) => [...prev, { role: "user", content }]);
      setIsRunning(true);

      let assistantContent = "";

      await agent.runAgent(
        {
          threadId: sessionId,
          runId: crypto.randomUUID(),
          project,
          sessionId,
          modelId,
          messages: [{ id: crypto.randomUUID(), role: "user", content }],
        },
        {
          onEvent: ({ event }: { event: BaseEvent }) => {
            if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
              assistantContent += (event as { delta: string }).delta;
            }
          },
          onRunFailed: () => setIsRunning(false),
          onRunFinalized: () => {
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
