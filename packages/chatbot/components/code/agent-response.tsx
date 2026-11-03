"use client";

import { CodingAgentMarkdownAnchor } from "./coding-agent-markdown-anchor";
import { CommentableAgentResponse } from "./commentable-agent-response";
import type { ResponsePendingComment } from "./file-browser/types";
import { Response } from "@/components/chat/response";

const COMPONENTS = { a: CodingAgentMarkdownAnchor };

export interface AgentResponseProps {
  children: string;
  messageId?: string;
  turnNumber?: number;
  responseComments?: ResponsePendingComment[];
}

export const AgentResponse: React.FC<AgentResponseProps> = ({
  children,
  messageId,
  turnNumber,
  responseComments,
}) => {
  if (messageId !== undefined && turnNumber !== undefined) {
    return (
      <CommentableAgentResponse
        messageId={messageId}
        turnNumber={turnNumber}
        comments={responseComments ?? []}
      >
        {children}
      </CommentableAgentResponse>
    );
  }
  return <Response components={COMPONENTS}>{children}</Response>;
};
