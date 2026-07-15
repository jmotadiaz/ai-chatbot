"use client";

import * as React from "react";
import { CodeXml } from "lucide-react";
import { AgentMessage } from "./agent-message";
import { ChatNavigation } from "@/components/chat/navigation";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";
import { DotsLoadingIcon } from "@/components/ui/icons";
import type { AgentItem } from "@/lib/features/code/types";
import { useAgentConversationScroll } from "@/lib/features/code/hooks/use-agent-conversation-scroll";
import {
  ConversationBody,
  ConversationContainer,
} from "@/components/chat/conversation-container";
import { ProjectOverview } from "@/components/project/overview";

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
  const hasConversationContent = items.length;

  return (
    <ConversationContainer className="flex-1">
      <ConversationBody bodyRef={scrollContainerRef} className="h-full">
        {hasConversationContent ? (
          <div className="max-w-5xl mx-auto px-8 pb-15">
            {items.map((item, index) => {
              const isLast = index === items.length - 1;
              const isItemStreaming =
                isLast && isRunning && status.kind === "thinking";

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
          </div>
        ) : (
          <ProjectOverview.Container className="justify-center">
            <ProjectOverview.Title>
              <CodeXml className="mr-1" strokeWidth={2} size={42} />
              <span>Coding Agent</span>
            </ProjectOverview.Title>
          </ProjectOverview.Container>
        )}

        {isRunning && (
          <div className="max-w-5xl mx-auto px-8">
            <div
              data-testid="agent-status"
              className="flex items-center gap-2 text-muted-foreground text-sm py-3"
            >
              <DotsLoadingIcon />
            </div>
          </div>
        )}
      </ConversationBody>

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
    </ConversationContainer>
  );
};
