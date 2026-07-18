"use client";

import React, { memo } from "react";
import Link from "next/link";
import { Trash2, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmModal, useConfirmModal } from "@/components/ui/confirm-modal";
import { Chat } from "@/lib/features/chat/types";
import { cn } from "@/lib/utils/helpers";

interface ChatHistoryItemProps {
  chat: Chat;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  onTogglePin: (id: string) => void;
  isPinning: boolean;
}

export const ChatHistoryItem: React.FC<ChatHistoryItemProps> = memo(
  ({ chat, onDelete, isDeleting, onTogglePin, isPinning }) => {
    const { openModal, modalProps } = useConfirmModal();

    return (
      <>
        <li
          className={cn(
            "flex items-center justify-between p-3 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
          )}
        >
          <div className="flex items-center flex-1 mr-4 truncate">
            <Link
              href={`/chat/${chat.id}`}
              className={cn("truncate text-sm font-medium", "hover:underline")}
            >
              {chat.title}
            </Link>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors",
                chat.pinned
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
              )}
              onClick={() => onTogglePin(chat.id)}
              disabled={isPinning}
              aria-label={chat.pinned ? "Unpin chat" : "Pin chat"}
            >
              <Pin className={cn("w-4 h-4", chat.pinned && "fill-primary")} />
            </Button>
            <div className="w-px h-4 bg-muted-foreground" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={openModal}
              disabled={isDeleting}
              aria-label={`Delete chat ${chat.title}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </li>
        <ConfirmModal
          {...modalProps()}
          onConfirm={() => onDelete(chat.id)}
          isLoading={isDeleting}
          title="Delete Chat?"
          message={`Are you sure you want to delete the chat "${chat.title}"? This action cannot be undone.`}
        />
      </>
    );
  }
);

ChatHistoryItem.displayName = "ChatHistoryItem";
