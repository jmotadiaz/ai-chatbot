"use client";

import React, { memo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chat } from "@/lib/features/chat/types";
import Link from "next/link";
import { cn } from "@/lib/utils/helpers";

interface ChatHistoryItemProps {
  chat: Chat;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

export const ChatHistoryItem: React.FC<ChatHistoryItemProps> = memo(
  ({ chat, onDelete, isDeleting }) => {
    return (
      <li className="flex items-center justify-between p-3 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors">
        <Link
          href={`/chat/${chat.id}`}
          className={cn(
            "flex-1 truncate mr-4 text-sm font-medium",
            "hover:underline"
          )}
        >
          {chat.title}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(chat.id)}
          disabled={isDeleting}
          aria-label={`Delete chat ${chat.title}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </li>
    );
  }
);

ChatHistoryItem.displayName = "ChatHistoryItem";
