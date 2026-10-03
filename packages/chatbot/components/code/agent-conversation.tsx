"use client";

import * as React from "react";
import { CodeXml } from "lucide-react";
import { AgentMessage } from "./agent-message";
import { TurnFilesChanged } from "./turn-files-changed";
import { ChatNavigation } from "@/components/chat/navigation";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";
import { DotsLoadingIcon } from "@/components/ui/icons";
import type { AgentItem } from "@/lib/features/code/types";
import type { TurnFilesMap } from "@/lib/features/code/turn-files";
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
  turnFiles?: TurnFilesMap;
  /**
   * Text of an armed Steering still queued in the worker. The bubble is a
   * read-only derivative of that queue state (never a synthetic Message): it
   * disappears in the same tick the real user message is delivered.
   */
  steeringPending?: string | null;
}

/**
 * Imitates the user message bubble shape (see `UserMessage`) but is its own
 * block: no copy button, no collapse, no actions. Static badge, no timers.
 */
interface SteeringPendingBubbleProps {
  text: string;
}

const SteeringPendingBubble: React.FC<SteeringPendingBubbleProps> = ({ text }) => (
  // No `data-role="user"`: that role marks the scroll anchors prev/next
  // navigation walks, and a derived bubble is not one of them.
  <div data-testid="steering-pending-bubble">
    <div className="mb-8 pt-4">
      <div className="flex gap-4 w-full ml-auto max-w-full w-fit">
        <div className="flex flex-col w-full space-y-2">
          <div className="flex flex-col max-w-full bg-secondary/50 py-4 pl-4 pr-8 rounded-tl-3xl rounded-br-3xl rounded-bl-3xl border border-dashed border-muted-foreground/40">
            <div className="flex flex-row gap-2 items-start w-full min-w-0 wrap-anywhere">
              {text}
            </div>
            <span
              data-testid="steering-pending-badge"
              className="mt-2 self-start text-xs text-muted-foreground border border-dashed border-muted-foreground/40 rounded px-2 py-0.5"
            >
              Pendiente de entrega
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const AgentConversation: React.FC<AgentConversationProps> = ({
  items,
  isRunning,
  status,
  turnFiles,
  steeringPending,
}) => {
  const {
    scrollContainerRef,
    showTop,
    showBottom,
    showPrev,
    showNext,
    scrollToTop,
    scrollToBottom,
    scrollToPrev,
    scrollToNext,
  } = useAgentConversationScroll({ items });
  const hasConversationContent = items.length;
  const steeringBubble = steeringPending?.trim() ? (
    <SteeringPendingBubble text={steeringPending} />
  ) : null;

  const runningIndicator = isRunning ? (
    <div
      data-testid="agent-status"
      className="flex items-center gap-2 text-muted-foreground text-sm py-1"
    >
      <DotsLoadingIcon />
    </div>
  ) : null;

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
                const changedFiles = turnFiles?.get(item.message.id);
                return (
                  <React.Fragment key={item.message.id}>
                    <AgentMessage
                      message={item.message}
                      toolGroups={item.toolGroups}
                      isStreaming={isItemStreaming}
                    />
                    {changedFiles && <TurnFilesChanged files={changedFiles} />}
                  </React.Fragment>
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
            {steeringBubble}
            {runningIndicator}
          </div>
        ) : (
          <>
            <ProjectOverview.Container className="justify-center">
              <ProjectOverview.Title>
                <CodeXml className="mr-1" strokeWidth={2} size={42} />
                <span>Coding Agent</span>
              </ProjectOverview.Title>
            </ProjectOverview.Container>
            {(runningIndicator || steeringBubble) && (
              <div className="max-w-5xl mx-auto px-8">
                {steeringBubble}
                {runningIndicator}
              </div>
            )}
          </>
        )}
      </ConversationBody>

      <ChatNavigation
        showPrev={showPrev}
        showNext={showNext}
        showBottom={showBottom}
        showTop={showTop}
        scrollToPrev={scrollToPrev}
        scrollToNext={scrollToNext}
        scrollToBottom={scrollToBottom}
        scrollToTop={scrollToTop}
        className="bottom-4"
      />
    </ConversationContainer>
  );
};
