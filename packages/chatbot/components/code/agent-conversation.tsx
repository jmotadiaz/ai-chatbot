"use client";

import * as React from "react";
import { AgentMessage } from "./agent-message";
import { ChatNavigation } from "@/components/chat/navigation";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";
import { DotsLoadingIcon } from "@/components/ui/icons";
import type { AgentItem } from "@/lib/features/code/types";
import { useAgentConversationScroll } from "@/lib/features/code/hooks/use-agent-conversation-scroll";

export interface AgentConversationProps {
  items: AgentItem[];
  isRunning: boolean;
  status: AgentStatus;
}

export const AgentConversation: React.FC<AgentConversationProps> = ({
  items,
  isRunning,
  status,
}) => {
  const {
    scrollContainerRef,
    showTop,
    showBottom,
    scrollToTop,
    scrollToBottom,
  } = useAgentConversationScroll({ items });

  return (
    <div className="w-full relative overflow-y-hidden flex-1">
      <div className="w-full h-full overflow-y-auto" ref={scrollContainerRef}>
        {items.length === 0 && !isRunning && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Ask the coding agent a question to get started.
          </div>
        )}
        <div className="max-w-5xl mx-auto px-8 pb-15">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            const isItemStreaming = isLast && isRunning && status.kind === "thinking";

            if (item.kind === "assistant") {
              return (
                <AgentMessage
                  key={item.message.id}
                  message={item.message}
                  toolGroups={item.toolGroups}
                  isStreaming={isItemStreaming}
                />
              );
            }
            return (
              <AgentMessage
                key={item.message.id}
                message={item.message}
                isStreaming={isItemStreaming}
              />
            );
          })}
          {isRunning && (
            <div
              data-testid="agent-status"
              className="flex items-center gap-2 text-muted-foreground text-sm py-3"
            >
              <DotsLoadingIcon />
            </div>
          )}
        </div>
      </div>
      <ChatNavigation
        showPrev={false}
        showNext={false}
        showBottom={showBottom}
        showTop={showTop}
        scrollToPrev={() => {}}
        scrollToNext={() => {}}
        scrollToBottom={scrollToBottom}
        scrollToTop={scrollToTop}
        className="bottom-4"
      />
    </div>
  );
};
