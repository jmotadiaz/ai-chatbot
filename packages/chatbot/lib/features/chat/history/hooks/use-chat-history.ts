"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { deleteChat, togglePinChat } from "@/lib/features/chat/actions";
import { getHistoryChatsAction } from "@/lib/features/chat/history/actions";
import type { Chat } from "@/lib/features/chat/types";
import {
  usePaginatedSearch,
  type PaginatedSearch,
} from "@/lib/utils/hooks/use-paginated-search";

export interface UseChatHistoryParams {
  initialChats: Chat[];
  initialHasMore: boolean;
  itemsPerPage?: number;
}

/**
 * Chat History = the shared searchable listing plus the two chat-only actions.
 * Pinning and deleting mutate the listing in place, which is why the paginated
 * state exposes `setItems`.
 */
export interface UseChatHistoryReturn extends PaginatedSearch<Chat> {
  isDeleting: (chatId: string) => boolean;
  onDeleteChat: (chatId: string) => void;
  isPinning: (chatId: string) => boolean;
  onTogglePin: (chatId: string) => void;
}

export const useChatHistory = ({
  initialChats,
  initialHasMore,
  itemsPerPage = 20,
}: UseChatHistoryParams): UseChatHistoryReturn => {
  const history = usePaginatedSearch<Chat>({
    initialItems: initialChats,
    initialHasMore,
    itemsPerPage,
    fetchPage: async ({ filter, limit, offset }) => {
      const { chats, hasMore } = await getHistoryChatsAction({
        limit,
        offset,
        filter,
      });
      return { items: chats, hasMore };
    },
  });
  const { items: chats, setItems: setChats } = history;

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [pinningIds, setPinningIds] = useState<Set<string>>(new Set());

  const chatsRef = useRef<Chat[]>(initialChats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const onDeleteChat = useCallback(
    (chatId: string) => {
      setDeletingIds((prev) => new Set(prev).add(chatId));

      void (async () => {
        try {
          await deleteChat(chatId);
          setChats((prev) => prev.filter((chat) => chat.id !== chatId));
          toast.success("Chat deleted successfully");
        } catch (error) {
          console.error("Error deleting chat:", error);
          toast.error("Failed to delete chat");
        } finally {
          setDeletingIds((prev) => {
            const next = new Set(prev);
            next.delete(chatId);
            return next;
          });
        }
      })();
    },
    [setChats],
  );

  const onTogglePin = useCallback(
    (chatId: string) => {
      setPinningIds((prev) => new Set(prev).add(chatId));

      void (async () => {
        try {
          // Optimistic update
          setChats((prev) =>
            prev
              .map((chat) =>
                chat.id === chatId ? { ...chat, pinned: !chat.pinned } : chat,
              )
              // Keep the server order: pinning never moves a chat.
              .sort(
                (a, b) =>
                  new Date(b.updatedAt).getTime() -
                  new Date(a.updatedAt).getTime(),
              ),
          );

          await togglePinChat(chatId);
          toast.success("Chat pin status updated");
        } catch (error) {
          console.error("Error toggling pin:", error);
          toast.error("Failed to update pin status");
          // Revert: reload the pages the user already saw with the same filter.
          const result = await getHistoryChatsAction({
            limit: chatsRef.current.length,
            offset: 0,
            filter: history.debouncedFilter,
          });
          setChats(result.chats);
        } finally {
          setPinningIds((prev) => {
            const next = new Set(prev);
            next.delete(chatId);
            return next;
          });
        }
      })();
    },
    [history.debouncedFilter, setChats],
  );

  const isDeleting = useCallback(
    (chatId: string) => deletingIds.has(chatId),
    [deletingIds],
  );

  const isPinning = useCallback(
    (chatId: string) => pinningIds.has(chatId),
    [pinningIds],
  );

  return useMemo(
    () => ({ ...history, isDeleting, onDeleteChat, isPinning, onTogglePin }),
    [history, isDeleting, onDeleteChat, isPinning, onTogglePin],
  );
};
