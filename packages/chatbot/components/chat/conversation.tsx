"use client";

import { ChatbotProjectOverview } from "@/components/project/chatbot-overview";
import { Messages, Message } from "@/components/chat/message";
import { ChatNavigation } from "@/components/chat/navigation";
import { LoadingMessage } from "@/components/chat/loading-message";
import {
  ConversationBody,
  ConversationContainer,
} from "@/components/chat/conversation-container";
import type { ProjectOverviewSize } from "@/components/project/overview";
import { useChatMessagesTurns } from "@/lib/features/chat/conversation/hooks/use-chat-messages-turns";
import { useChatNavigation } from "@/lib/features/chat/conversation/hooks/use-chat-navigation";
import type { UseChatResult } from "@/lib/features/chat/conversation/hooks/use-chat";

export interface ChatConversationProps extends Pick<
  UseChatResult,
  "messages" | "status"
> {
  title?: string;
  description?: string;
  overviewSize?: ProjectOverviewSize;
  className?: string;
  reload?: boolean;
}

export const ChatConversation: React.FC<ChatConversationProps> = ({
  className,
  messages,
  status,
  title,
  description,
  overviewSize,
  reload,
}) => {
  const { previousMessages, lastTurnMessages } = useChatMessagesTurns(
    messages,
    status,
  );

  const {
    showPrev,
    showNext,
    showBottom,
    showTop,
    scrollToPrev,
    scrollToNext,
    scrollToBottom,
    scrollToTop,
    scrollContainerRef,
    topSentinelRef,
    bottomSentinelRef,
  } = useChatNavigation({
    messages,
  });
  const hasMessages = messages.length > 0;

  return (
    <ConversationContainer className={className}>
      <ConversationBody bodyRef={scrollContainerRef}>
        {hasMessages ? (
          <>
            <div ref={topSentinelRef} className="h-[1px] w-full" />
            {previousMessages.length > 0 && (
              <div className="max-w-5xl mx-auto px-8">
                <Messages messages={previousMessages} />
              </div>
            )}

            <div className="min-h-[calc(100%-2px)] max-w-5xl mx-auto px-8 pb-15">
              {lastTurnMessages.map((m, index) => (
                <Message
                  key={m.id}
                  message={m}
                  showReload={
                    reload &&
                    index === lastTurnMessages.length - 1 &&
                    m.role === "assistant" &&
                    (status === "ready" || status === "error")
                  }
                />
              ))}
              <LoadingMessage
                message={messages[messages.length - 1]}
                status={status}
                className="mt-2"
              />
            </div>
            <div ref={bottomSentinelRef} className="h-[1px] w-full" />
          </>
        ) : (
          <ChatbotProjectOverview
            title={title}
            description={description}
            size={overviewSize}
          />
        )}
      </ConversationBody>

      {hasMessages && (
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
      )}
    </ConversationContainer>
  );
};
