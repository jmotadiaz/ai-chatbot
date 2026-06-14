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
        threadId: sessionId,
      }),
    [sessionId],
  );

  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [isRunning, setIsRunning] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      setMessages((prev) => [...prev, { role: "user", content }]);
      setIsRunning(true);

      let assistantContent = "";

      agent.addMessage({ id: crypto.randomUUID(), role: "user", content });

      await agent.runAgent(
        {
          runId: crypto.randomUUID(),
          forwardedProps: {
            project,
            sessionId,
            modelId,
          },
        },
        {
          onEvent: ({ event }: { event: BaseEvent }) => {
            if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
              assistantContent += (event as unknown as { delta: string }).delta;
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
