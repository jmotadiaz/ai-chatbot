"use client";

import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { Tools } from "@/lib/features/chat/types";
import type { HubInstance, ChatHub } from "@/lib/features/chat/hub/types";
import { useChatHubInstance } from "@/lib/features/chat/hub/hooks/use-chat-hub-instance";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/helpers";
import { ChatConversation } from "@/components/chat/conversation";

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

  const chat = useChatHubInstance({
    chatId: instance.chatId,
    model: instance.model,
    submitSubscribe,
    tools,
    preventChatPersistence: true,
  });

  const onSelectThisChat = useCallback(async () => {
    const { chatId } = await persistChat({
      chatId: instance.chatId,
      messages: chat.messages,
      model: instance.model,
      tools,
    });
    router.push(`/chat/${chatId}`);
  }, [
    chat.messages,
    instance.chatId,
    instance.model,
    persistChat,
    router,
    tools,
  ]);

  const isThisPersisting = isPersisting && persistingChatId === instance.chatId;

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

      <ChatConversation
        messages={chat.messages}
        status={chat.status}
        title={instance.model}
        className={cn(
          "flex-1 flex",
          chat.messages.length ? "items-start" : "items-center"
        )}
      />
    </div>
  );
};
