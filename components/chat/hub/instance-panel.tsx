"use client";

import React, { useCallback } from "react";
import { Trash2 } from "lucide-react";
import type { Agent } from "@/lib/features/chat/types";
import type { HubInstance, ChatHub } from "@/lib/features/chat/hub/types";
import { useChatHubInstance } from "@/lib/features/chat/hub/hooks/use-chat-hub-instance";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/helpers";
import { ChatConversation } from "@/components/chat/conversation";

export interface HubInstancePanelProps {
  instance: HubInstance;
  submitSubscribe: ChatHub["submitSubscribe"];
  agent: Agent;
  onRemove: (id: string) => void;
  persistChat: ChatHub["persistChat"];
  isPersisting: boolean;
  persistingChatId: string | null;
  isPersisted: boolean;
  className?: string;
}

export const HubInstancePanel: React.FC<HubInstancePanelProps> = ({
  instance,
  submitSubscribe,
  agent,
  onRemove,
  persistChat,
  isPersisting,
  persistingChatId,
  isPersisted,
  className,
}) => {
  const chat = useChatHubInstance({
    chatId: instance.chatId,
    model: instance.model,
    submitSubscribe,
    agent,
    preventChatPersistence: true,
  });

  const onSelectThisChat = useCallback(async () => {
    await persistChat({
      chatId: instance.chatId,
      messages: chat.messages,
      model: instance.model,
      agent,
    });
    // Removed navigation: router.push(...)
  }, [chat.messages, instance.chatId, instance.model, persistChat, agent]);

  const isThisPersisting = isPersisting && persistingChatId === instance.chatId;

  return (
    <div
      data-testid="hub-instance-panel"
      className={cn(
        "rounded-xl border bg-secondary/30 overflow-hidden h-full min-h-0 flex flex-col",
        className,
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="font-semibold truncate">{instance.model}</div>
        <div className="flex items-center gap-2">
          {isPersisted ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onRemove(instance.chatId)}
            >
              Delete chat
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={onSelectThisChat}
              isLoading={isThisPersisting}
              disabled={isPersisting || chat.messages.length === 0}
            >
              Select this chat
            </Button>
          )}

          {!isPersisted && (
            <Button
              variant="icon"
              size="icon"
              aria-label="Remove instance"
              onClick={() => onRemove(instance.chatId)}
              disabled={isPersisting}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <ChatConversation
        messages={chat.messages}
        status={chat.status}
        title={instance.model}
        className={cn(
          "flex-1 flex",
          chat.messages.length ? "items-start" : "items-center",
        )}
      />
    </div>
  );
};
