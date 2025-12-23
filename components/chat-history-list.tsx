"use client";

import { Fragment } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Chat } from "@/lib/features/chat/types";
import { useChatHistory } from "@/lib/features/chat/history/use-chat-history";
import { ChatHistoryItem } from "@/components/chat-history-item";

interface ChatHistoryListProps {
  chats: Chat[];
}

export const ChatHistoryList: React.FC<ChatHistoryListProps> = ({
  chats: initialChats,
}) => {
  const {
    filteredChats,
    handleDelete,
    filter,
    setFilter,
    isLoading,
    loader,
    scrollContainer,
    offset,
    ITEMS_TO_TRIGGER_PAGINATION,
  } = useChatHistory(initialChats);

  return (
    <div className="w-full pb-6">
      <div className="flex flex-col lg:flex-row gap-4 mb-8 items-center">
        <div className="relative flex-1 w-full">
          <Input
            className="pl-10"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter chats..."
          />
          <SearchIcon className="absolute top-1/2 left-3 w-4 h-4 transform -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
      <ul
        ref={scrollContainer}
        className="space-y-3 max-h-[70dvh] overflow-auto scrollbar-none"
      >
        {filteredChats.slice(0, offset).map((chat, idx) => (
          <Fragment key={chat.id}>
            <ChatHistoryItem
              chat={chat}
              isLoading={isLoading}
              onDelete={handleDelete}
            />
            {idx === offset - ITEMS_TO_TRIGGER_PAGINATION &&
              offset < filteredChats.length && (
                <li
                  ref={loader}
                  className="h-px w-full opacity-0 pointer-events-none"
                  aria-hidden="true"
                />
              )}
          </Fragment>
        ))}
      </ul>
    </div>
  );
};
