"use client";

import { useState, useTransition, useCallback, Fragment, useEffect } from "react";
import { toast } from "sonner";
import { SearchIcon } from "lucide-react";
import { ChatHistoryItem } from "./chat-history-item";
import { deleteChat } from "@/lib/features/chat/actions";
import { getHistoryChatsAction } from "@/lib/features/chat/history/actions";
import { Input } from "@/components/ui/input";
import { useIntersectionObserver } from "@/lib/utils/hooks/intersection";
import { Chat } from "@/lib/features/chat/types";
import { useDebounce } from "use-debounce";

interface ChatHistoryProps {
  initialChats: Chat[];
  initialHasMore: boolean;
}

const ITEMS_PER_PAGE = 20;

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  initialChats,
  initialHasMore,
}) => {
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [debouncedFilter] = useDebounce(filter, 300);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Reset and refetch when filter changes
  useEffect(() => {
    // Skip the first run if filter is empty (since we have initialChats)
    // However, if we delete items, we might want to refresh?
    // Actually, keeping it simple: if filter changes, refetch.
    // To avoid double fetch on mount (since debouncedFilter is ""), we can use a ref.
    if (debouncedFilter === "" && chats === initialChats) return;

    const fetchFiltered = async () => {
      startTransition(async () => {
        const result = await getHistoryChatsAction({
          limit: ITEMS_PER_PAGE,
          offset: 0,
          filter: debouncedFilter,
        });
        setChats(result.chats);
        setHasMore(result.hasMore);
      });
    };

    fetchFiltered();
  }, [debouncedFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading) return;

    startTransition(async () => {
      const result = await getHistoryChatsAction({
        limit: ITEMS_PER_PAGE,
        offset: chats.length,
        filter: debouncedFilter,
      });

      setChats((prev) => [...prev, ...result.chats]);
      setHasMore(result.hasMore);
    });
  }, [hasMore, isLoading, chats.length, debouncedFilter]);

  const { loader, scrollContainer } = useIntersectionObserver<
    HTMLUListElement,
    HTMLLIElement
  >({
    onIntersect: loadMore,
  });

  const handleDeleteChat = (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      try {
        await deleteChat(id);
        setChats((prev) => prev.filter((chat) => chat.id !== id));
        toast.success("Chat deleted successfully");
      } catch (error) {
        console.error("Error deleting chat:", error);
        toast.error("Failed to delete chat");
      } finally {
        setDeletingIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
        });
      }
    });
  };

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
        {chats.map((chat) => (
          <ChatHistoryItem
            key={chat.id}
            chat={chat}
            onDelete={handleDeleteChat}
            isDeleting={deletingIds.has(chat.id)}
          />
        ))}
        {chats.length === 0 && !isLoading && (
            <div className="text-center text-muted-foreground py-8">
                No chats found.
            </div>
        )}
        {hasMore && (
           <li
             ref={loader}
             className="h-8 w-full flex items-center justify-center text-muted-foreground text-sm"
           >
             {isLoading ? "Loading more..." : ""}
           </li>
        )}
      </ul>
    </div>
  );
};
