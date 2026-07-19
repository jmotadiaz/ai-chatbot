"use client";

import * as React from "react";
import { memo } from "react";
import type { Message } from "@ag-ui/client";
import { ToolCallGroup } from "./tool-call-group";
import { AgentResponse } from "./agent-response";
import { ReasoningBlock } from "@/components/chat/reasoning";
import { UserMessage } from "@/components/chat/user-message";
import type { ToolCallGroup as Group } from "@/lib/features/code/types";

export interface AgentMessageProps {
  message: Message;
  toolGroups?: Group[];
  isStreaming?: boolean;
}

const ToolResultBlock: React.FC<{ content: string }> = ({ content }) => (
  <details data-orphan="true" className="my-2 text-xs">
    <summary className="cursor-pointer text-muted-foreground select-none">
      Tool result
    </summary>
    <pre className="mt-2 p-2 bg-secondary rounded overflow-x-auto whitespace-pre-wrap">
      {content}
    </pre>
  </details>
);

const areEqual = (prevProps: AgentMessageProps, nextProps: AgentMessageProps) => {
  if (prevProps.isStreaming !== nextProps.isStreaming) {
    return false;
  }

  const prevMsg = prevProps.message;
  const nextMsg = nextProps.message;

  if (
    prevMsg.id !== nextMsg.id ||
    prevMsg.role !== nextMsg.role ||
    prevMsg.content !== nextMsg.content
  ) {
    return false;
  }

  const prevGroups = prevProps.toolGroups;
  const nextGroups = nextProps.toolGroups;

  if (prevGroups === nextGroups) {
    return true;
  }

  if (!prevGroups || !nextGroups) {
    return false;
  }

  if (prevGroups.length !== nextGroups.length) {
    return false;
  }

  for (let i = 0; i < prevGroups.length; i++) {
    const p = prevGroups[i];
    const n = nextGroups[i];
    if (
      p.id !== n.id ||
      p.name !== n.name ||
      p.status !== n.status ||
      p.result !== n.result ||
      p.startedAt !== n.startedAt ||
      p.finishedAt !== n.finishedAt ||
      p.summary !== n.summary ||
      p.args !== n.args
    ) {
      return false;
    }
  }

  return true;
};

export const AgentMessage: React.FC<AgentMessageProps> = memo(
  ({ message, toolGroups, isStreaming }) => {
    if (message.role === "user") {
      const text = typeof message.content === "string" ? message.content : "";
      return <UserMessage text={text} messageId={message.id} />;
    }

    if (message.role === "reasoning") {
      const text = typeof message.content === "string" ? message.content : "";
      if (!text) return null;
      return (
        <div className="mb-4">
          <ReasoningBlock text={text} isStreaming={isStreaming} />
        </div>
      );
    }

    // Defensive fallback: orphans are dropped by groupItems, but tool
    // messages may still arrive via historical load or replay. Render
    // them inline so nothing is silently lost.
    if (message.role === "tool") {
      const text = typeof message.content === "string" ? message.content : "";
      return (
        <div className="mb-4 pl-4 max-w-full">
          <ToolResultBlock content={text} />
        </div>
      );
    }

    if (message.role === "assistant") {
      const text = typeof message.content === "string" ? message.content : "";
      return (
        <div className="mb-4">
          <div className="flex flex-col w-full gap-3">
            {toolGroups?.map((g) => (
              <ToolCallGroup key={g.id} group={g} />
            ))}
            {text && (
              <div className="max-w-full">
                <AgentResponse>{text}</AgentResponse>
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  },
  areEqual,
);

AgentMessage.displayName = "AgentMessage";
