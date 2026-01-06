"use client";

import React, { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { Tools } from "@/lib/features/chat/types";
import type { HubInstance, ChatHub } from "@/lib/features/chat/hub/types";
import { useChatHubInstance } from "@/lib/features/chat/hub/hooks/use-chat-hub-instance";
import { useChatMessagesTurns } from "@/lib/features/chat/hooks/use-chat-messages-turns";
import { Messages, Message } from "@/components/chat/message";
import { LoadingMessage } from "@/components/chat/loading-message";
import { ChatNavigation } from "@/components/chat/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/helpers";

export interface HubInstancePanelProps {
  instance: HubInstance;
  submitSubscribe: ChatHub["submitSubscribe"];
  tools: Tools;
  onRemove: (id: string) => void;
  persistChat: ChatHub["persistChat"];
  isPersisting: boolean;
  persistingChatId: string | null;
  className?: string;
}

export const HubInstancePanel: React.FC<HubInstancePanelProps> = ({
  instance,
  submitSubscribe,
  tools,
  onRemove,
  persistChat,
  isPersisting,
  persistingChatId,
  className,
}) => {
  const router = useRouter();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const chat = useChatHubInstance({
    chatId: instance.chatId,
    model: instance.model,
    submitSubscribe,
    tools,
    preventChatPersistence: true,
  });

  const { previousMessages, lastTurnMessages } = useChatMessagesTurns(chat.messages);

  const onSelectThisChat = useCallback(async () => {
    const { chatId } = await persistChat({
      chatId: instance.chatId,
      messages: chat.messages,
      model: instance.model,
      tools,
    });
    router.push(`/${chatId}`);
  }, [chat.messages, instance.chatId, instance.model, persistChat, router, tools]);

  const isThisPersisting =
    isPersisting && persistingChatId === instance.chatId;

  return (
    <div
      className={cn(
        "rounded-xl border bg-secondary/30 overflow-hidden h-full min-h-0 flex flex-col",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="font-semibold truncate">{instance.model}</div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onSelectThisChat}
            isLoading={isThisPersisting}
            disabled={isPersisting || chat.messages.length === 0}
          >
            Select this chat
          </Button>
          <Button
            variant="icon"
            size="icon"
            aria-label="Remove instance"
            onClick={() => onRemove(instance.chatId)}
            disabled={isPersisting}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <div
          className="h-full overflow-y-auto px-4 py-3"
          ref={scrollContainerRef}
        >
          {chat.messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Start chatting to compare models.
            </div>
          ) : (
            <>
              {/* Previous turns - natural height */}
              {previousMessages.length > 0 && (
                <Messages messages={previousMessages} />
              )}

              {/* Last turn - min-height for scroll positioning */}
              <div className="min-h-full">
                {lastTurnMessages.map((m) => (
                  <Message key={m.id} message={m} />
                ))}
                <LoadingMessage
                  message={chat.messages[chat.messages.length - 1]}
                  status={chat.status}
                />
              </div>
            </>
          )}
        </div>
        <ChatNavigation
          scrollContainerRef={scrollContainerRef}
          messages={chat.messages}
        />
      </div>
    </div>
  );
};


