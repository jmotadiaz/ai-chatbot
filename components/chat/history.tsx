"use client";

import { Fragment } from "react";
import { SearchIcon } from "lucide-react";
import { ChatHistoryItem } from "./history-item";
import { Input } from "@/components/ui/input";
import { Chat } from "@/lib/features/chat/types";
import { useChatHistory } from "@/lib/features/chat/history/hooks/use-chat-history";

interface ChatHistoryProps {
  initialChats: Chat[];
  initialHasMore: boolean;
}

const ITEMS_PER_PAGE = 20;
const ITEMS_TO_TRIGGER_PAGINATION = ITEMS_PER_PAGE / 2;

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  initialChats,
  initialHasMore,
}) => {
  const {
    chats,
    hasMore,
    isLoading,
    filter,
    setFilter,
    isDeleting,
    onDeleteChat,
    loader,
    scrollContainer,
  } = useChatHistory({
    initialChats,
    initialHasMore,
    itemsPerPage: ITEMS_PER_PAGE,
  });

  return (
    <div className="w-full pb-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Chat History</h1>
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
        aria-label="Chat history list"
      >
        {chats.map((chat, idx) => (
          <Fragment key={chat.id}>
            <ChatHistoryItem
              chat={chat}
              onDelete={onDeleteChat}
              isDeleting={isDeleting(chat.id)}
            />
            {hasMore &&
              chats.length >= ITEMS_TO_TRIGGER_PAGINATION &&
              idx === chats.length - ITEMS_TO_TRIGGER_PAGINATION && (
                <li
                  ref={loader}
                  className="h-px w-full opacity-0 pointer-events-none"
                  aria-hidden="true"
                />
              )}
          </Fragment>
        ))}
        {chats.length === 0 && !isLoading && (
            <div className="text-center text-muted-foreground py-8">
                No chats found.
            </div>
        )}
        {hasMore && isLoading && (
          <li className="h-8 w-full flex items-center justify-center text-muted-foreground text-sm">
            Loading more...
          </li>
        )}
      </ul>
    </div>
  );
};
