"use client";

import { memo } from "react";
import { Response } from "@/components/chat/response";

export interface AgentMessageProps {
  role: "user" | "assistant";
  content: string;
}

export const AgentMessage: React.FC<AgentMessageProps> = memo(
  ({ role, content }) => {
    if (role === "user") {
      return (
        <div className="mb-8 pt-4">
          <div className="flex gap-4 w-full ml-auto max-w-full w-fit">
            <div className="flex flex-col w-full space-y-2">
              <div className="flex flex-col max-w-full bg-secondary py-4 pl-4 pr-8 rounded-tl-3xl rounded-br-3xl rounded-bl-3xl">
                {content}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="mb-8 pt-4">
        <div className="flex flex-col w-full space-y-4">
          <Response>{content}</Response>
        </div>
      </div>
    );
  },
);

AgentMessage.displayName = "AgentMessage";
