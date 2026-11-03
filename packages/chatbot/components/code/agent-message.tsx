"use client";

import * as React from "react";
import { memo } from "react";
import type { Message } from "@ag-ui/client";
import { ToolCallGroup } from "./tool-call-group";
import { AgentResponse } from "./agent-response";
import type { ResponsePendingComment } from "./file-browser/types";
import { ReasoningBlock } from "@/components/chat/reasoning";
import { UserMessage } from "@/components/chat/user-message";
import { contentToDisplay } from "@/lib/features/code/attachments";
import { parseLeadingSkillCommands } from "@/lib/features/code/skill-commands";
import type { ToolCallGroup as Group } from "@/lib/features/code/types";

export interface AgentMessageProps {
  message: Message;
  toolGroups?: Group[];
  isStreaming?: boolean;
  responseTurnNumber?: number;
  responseComments?: ResponsePendingComment[];
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

function responseCommentsEqual(
  previous: ResponsePendingComment[] | undefined,
  next: ResponsePendingComment[] | undefined,
): boolean {
  if (previous === next) return true;
  if (!previous || !next || previous.length !== next.length) return false;
  return previous.every((comment, index) => {
    const other = next[index];
    return (
      comment.id === other?.id &&
      comment.messageId === other.messageId &&
      comment.turnNumber === other.turnNumber &&
      comment.startLine === other.startLine &&
      comment.endLine === other.endLine &&
      comment.lineText === other.lineText &&
      comment.text === other.text &&
      comment.createdAt === other.createdAt
    );
  });
}

const areEqual = (prevProps: AgentMessageProps, nextProps: AgentMessageProps) => {
  if (
    prevProps.isStreaming !== nextProps.isStreaming ||
    prevProps.responseTurnNumber !== nextProps.responseTurnNumber ||
    !responseCommentsEqual(
      prevProps.responseComments,
      nextProps.responseComments,
    )
  ) {
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
  ({
    message,
    toolGroups,
    isStreaming,
    responseTurnNumber,
    responseComments,
  }) => {
    if (message.role === "user") {
      const { text, files } = contentToDisplay(message.content);
      const parsed = parseLeadingSkillCommands(text);
      return (
        <div data-role="user">
          <UserMessage
            text={parsed.text}
            skills={parsed.skills}
            files={files}
            messageId={message.id}
          />
        </div>
      );
    }

    if (message.role === "reasoning") {
      const text = typeof message.content === "string" ? message.content : "";
      if (!text) return null;
      return (
        <div data-role="reasoning" className="mb-4">
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
        <div data-role="tool" className="mb-4 pl-4 max-w-full">
          <ToolResultBlock content={text} />
        </div>
      );
    }

    if (message.role === "assistant") {
      const text = typeof message.content === "string" ? message.content : "";
      return (
        <div data-role="assistant" className="mb-4">
          <div className="flex flex-col w-full gap-3">
            {toolGroups?.map((g) => (
              <ToolCallGroup key={g.id} group={g} />
            ))}
            {text && (
              <div className="max-w-full">
                <AgentResponse
                  messageId={
                    responseTurnNumber === undefined ? undefined : message.id
                  }
                  turnNumber={responseTurnNumber}
                  responseComments={responseComments}
                >
                  {text}
                </AgentResponse>
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
