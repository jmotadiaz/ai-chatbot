"use client";

import { ChatHistoryItem } from "./history-item";
import { SearchableHistory } from "@/components/history/searchable-history";
import { Chat } from "@/lib/features/chat/types";
import { useChatHistory } from "@/lib/features/chat/history/hooks/use-chat-history";

interface ChatHistoryProps {
  initialChats: Chat[];
  initialHasMore: boolean;
}

const ITEMS_PER_PAGE = 20;

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  initialChats,
  initialHasMore,
}) => {
  const { isDeleting, onDeleteChat, isPinning, onTogglePin, ...history } =
    useChatHistory({
      initialChats,
      initialHasMore,
      itemsPerPage: ITEMS_PER_PAGE,
    });

  return (
    <SearchableHistory<Chat>
      title="Chat History"
      state={history}
      placeholder="Filter chats..."
      emptyMessage="No chats found."
      getItemKey={(chat) => chat.id}
      testIds={{
        container: "history-container",
        filter: "chat-history-filter",
        list: "Chat history list",
      }}
      renderItem={(chat) => (
        <ChatHistoryItem
          chat={chat}
          onDelete={onDeleteChat}
          isDeleting={isDeleting(chat.id)}
          onTogglePin={onTogglePin}
          isPinning={isPinning(chat.id)}
        />
      )}
    />
  );
};
