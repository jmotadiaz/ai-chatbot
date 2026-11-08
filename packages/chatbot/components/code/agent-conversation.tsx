"use client";

import * as React from "react";
import { CodeXml } from "lucide-react";
import { AgentMessage } from "./agent-message";
import { ReActCycleView } from "./react-cycle";
import { TurnFilesChanged } from "./turn-files-changed";
import {
  isResponseComment,
  type PendingComment,
} from "./file-browser/types";
import { ChatNavigation } from "@/components/chat/navigation";
import type { AgentStatus } from "@/lib/features/code/hooks/use-coding-agent";
import { DotsLoadingIcon } from "@/components/ui/icons";
import type { AgentItem } from "@/lib/features/code/types";
import { buildConversationBlocks } from "@/lib/features/code/react-cycles";
import type { TurnFilesMap } from "@/lib/features/code/turn-files";
import { responseCommentTargets } from "@/lib/features/code/response-comments";
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
  /** Supplied by the main session composer; subagent views stay read-only. */
  pendingComments?: PendingComment[];
  /**
   * Message Edit (ADR 0015): id of the user Message being rewritten. It stays
   * rendered, and everything after it is dimmed — the Abandoned Branch the
   * submit will discard. Absent in read-only views, which also get no pencil.
   */
  editingMessageId?: string | null;
  /** Present only in the editable Coding Agent transcript. */
  onEditUserMessage?: (messageId: string) => void;
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
  pendingComments,
  editingMessageId,
  onEditUserMessage,
}) => {
  const blocks = React.useMemo(() => buildConversationBlocks(items), [items]);
  const editedIndex = React.useMemo(
    () =>
      editingMessageId
        ? blocks.findIndex(
            (block) =>
              block.kind === "user" && block.message.id === editingMessageId,
          )
        : -1,
    [blocks, editingMessageId],
  );
  // Turn files are anchored to the assistant Message that closed the turn: the
  // LAST block carrying it hosts the card, so a turn that ended on tool calls
  // still shows it at the bottom of the cycle instead of above its own rows.
  const filesBlockIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (!turnFiles || turnFiles.size === 0) return ids;
    const seen = new Set<string>();
    for (let index = blocks.length - 1; index >= 0; index--) {
      const block = blocks[index];
      const messageId =
        block.kind === "cycle" ? block.cycle.originMessageId : block.message.id;
      if (turnFiles.has(messageId) && !seen.has(messageId)) ids.add(block.id);
      seen.add(messageId);
    }
    return ids;
  }, [blocks, turnFiles]);
  const responseTargets = React.useMemo(
    () =>
      pendingComments
        ? responseCommentTargets(items, isRunning)
        : new Map<string, { turnNumber: number }>(),
    [items, isRunning, pendingComments],
  );
  const responseComments = React.useMemo(
    () => pendingComments?.filter(isResponseComment),
    [pendingComments],
  );
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
  const hasConversationContent = blocks.length;
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
            {blocks.map((block, index) => {
              const isLast = index === blocks.length - 1;
              const isTailStreaming = isLast && isRunning;
              const isAbandoned = editedIndex >= 0 && index > editedIndex;
              const changedFiles = filesBlockIds.has(block.id)
                ? turnFiles?.get(
                    block.kind === "cycle"
                      ? block.cycle.originMessageId
                      : block.message.id,
                  )
                : undefined;

              return (
                <div
                  key={block.id}
                  data-abandoned={isAbandoned ? "true" : undefined}
                  className={
                    isAbandoned ? "opacity-40 transition-opacity" : undefined
                  }
                >
                  {block.kind === "cycle" ? (
                    <ReActCycleView
                      cycle={block.cycle}
                      active={isTailStreaming}
                      streamingReasoning={isTailStreaming && status.kind === "thinking"}
                    />
                  ) : (
                    <AgentMessage
                      message={block.message}
                      responseTurnNumber={
                        block.kind === "response"
                          ? responseTargets.get(block.message.id)?.turnNumber
                          : undefined
                      }
                      responseComments={
                        block.kind === "response"
                          ? responseComments?.filter(
                              (comment) => comment.messageId === block.message.id,
                            )
                          : undefined
                      }
                      onEditUserMessage={onEditUserMessage}
                    />
                  )}
                  {changedFiles && <TurnFilesChanged files={changedFiles} />}
                </div>
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
