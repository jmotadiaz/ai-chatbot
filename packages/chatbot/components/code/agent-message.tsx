"use client";

import * as React from "react";
import { memo } from "react";
import type { Message } from "@ag-ui/client";
import { AgentResponse } from "./agent-response";
import type { ResponsePendingComment } from "./file-browser/types";
import { UserMessage } from "@/components/chat/user-message";
import { contentToDisplay } from "@/lib/features/code/attachments";
import { parseLeadingSkillCommands } from "@/lib/features/code/skill-commands";

export interface AgentMessageProps {
  message: Message;
  responseTurnNumber?: number;
  responseComments?: ResponsePendingComment[];
  /** Message Edit: present only in the editable Coding Agent transcript. */
  onEditUserMessage?: (messageId: string) => void;
}

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
    prevProps.responseTurnNumber !== nextProps.responseTurnNumber ||
    prevProps.onEditUserMessage !== nextProps.onEditUserMessage ||
    !responseCommentsEqual(
      prevProps.responseComments,
      nextProps.responseComments,
    )
  ) {
    return false;
  }

  const prevMsg = prevProps.message;
  const nextMsg = nextProps.message;

  return (
    prevMsg.id === nextMsg.id &&
    prevMsg.role === nextMsg.role &&
    prevMsg.content === nextMsg.content
  );
};

/**
 * One user Message or one assistant response of the transcript. Reasoning and
 * tool calls are not rendered here: they belong to a ReAct Cycle
 * (`ReActCycleView`), which is what the transcript orders around the responses.
 */
export const AgentMessage: React.FC<AgentMessageProps> = memo(
  ({ message, responseTurnNumber, responseComments, onEditUserMessage }) => {
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
            onEdit={
              onEditUserMessage
                ? () => onEditUserMessage(message.id)
                : undefined
            }
          />
        </div>
      );
    }

    if (message.role !== "assistant") return null;

    const text = typeof message.content === "string" ? message.content : "";
    if (!text) return null;

    return (
      <div data-role="assistant" className="mb-4">
        <div className="max-w-full">
          <AgentResponse
            messageId={responseTurnNumber === undefined ? undefined : message.id}
            turnNumber={responseTurnNumber}
            responseComments={responseComments}
          >
            {text}
          </AgentResponse>
        </div>
      </div>
    );
  },
  areEqual,
);

AgentMessage.displayName = "AgentMessage";
