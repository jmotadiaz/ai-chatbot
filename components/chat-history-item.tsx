"use client";

import React, { memo } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chat } from "@/lib/features/chat/types";

interface ChatHistoryItemProps {
  chat: Chat;
  isLoading: boolean;
  onDelete: (id: string) => void;
}

export const ChatHistoryItem: React.FC<ChatHistoryItemProps> = memo(
  ({ chat, isLoading, onDelete }) => {
    return (
      <li className="flex items-center justify-between p-3 bg-secondary rounded-lg">
        <Link
          className="truncate cursor-pointer hover:underline flex-1"
          href={`/chat/${chat.id}`}
        >
          {chat.title}
        </Link>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(chat.id)}
          disabled={isLoading}
          className="ml-2"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </li>
    );
  }
);

ChatHistoryItem.displayName = "ChatHistoryItem";
