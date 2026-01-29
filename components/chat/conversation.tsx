"use client";

import { ProjectOverview } from "@/components/project/overview";
import { Messages, Message } from "@/components/chat/message";
import { ChatNavigation } from "@/components/chat/navigation";
import { cn } from "@/lib/utils/helpers";
import { LoadingMessage } from "@/components/chat/loading-message";
import { useChatMessagesTurns } from "@/lib/features/chat/hooks/use-chat-messages-turns";
import { useChatNavigation } from "@/lib/features/chat/hooks/use-chat-navigation";
import { UseChatResult } from "@/lib/features/chat/hooks/use-chat";

export interface ChatConversationProps extends Pick<
  UseChatResult,
  "messages" | "status" | "title"
> {
  className?: string;
  reload?: boolean;
}

export const ChatConversation: React.FC<ChatConversationProps> = ({
  className,
  messages,
  status,
  title,
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

  return (
    <div className={cn("w-full relative overflow-y-hidden", className)}>
      <div
        className={cn("w-full overflow-y-auto", messages.length && "h-full")}
        ref={scrollContainerRef}
      >
        <>
          {messages.length === 0 ? (
            <ProjectOverview title={title} />
          ) : (
            <>
              <div ref={topSentinelRef} className="h-[1px] w-full" />
              {/* Turnos anteriores - altura natural */}
              {previousMessages.length > 0 && (
                <div className="max-w-5xl mx-auto px-8">
                  <Messages messages={previousMessages} />
                </div>
              )}

              {/* Último turno - min-height para permitir scroll al inicio, restando los sentinels */}
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
          )}
        </>
      </div>
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
    </div>
  );
};
