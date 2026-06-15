"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";

import { deleteChat, togglePinChat } from "@/lib/features/chat/actions";
import { getHistoryChatsAction } from "@/lib/features/chat/history/actions";
import { useIntersectionObserver } from "@/lib/utils/hooks/intersection";
import type { Chat } from "@/lib/features/chat/types";

export interface UseChatHistoryParams {
  initialChats: Chat[];
  initialHasMore: boolean;
  itemsPerPage?: number;
}

export interface UseChatHistoryReturn {
  chats: Chat[];
  hasMore: boolean;
  isLoading: boolean;
  filter: string;
  setFilter: (value: string) => void;
  isDeleting: (chatId: string) => boolean;
  onDeleteChat: (chatId: string) => void;
  isPinning: (chatId: string) => boolean;
  onTogglePin: (chatId: string) => void;
  scrollContainer: React.RefObject<HTMLUListElement | null>;
  loader: React.RefCallback<HTMLLIElement>;
}

export const useChatHistory = ({
  initialChats,
  initialHasMore,
  itemsPerPage = 20,
}: UseChatHistoryParams): UseChatHistoryReturn => {
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isLoading, startTransition] = useTransition();
  const [filter, setFilter] = useState<string>("");
  const [debouncedFilter] = useDebounce(filter, 300);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [pinningIds, setPinningIds] = useState<Set<string>>(new Set());

  const chatsRef = useRef<Chat[]>(initialChats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      // Avoid a duplicate fetch on mount; server already provided initial data.
      if (debouncedFilter === "") return;
    }

    startTransition(async () => {
      const result = await getHistoryChatsAction({
        limit: itemsPerPage,
        offset: 0,
        filter: debouncedFilter,
      });
      setChats(result.chats);
      setHasMore(result.hasMore);
    });
  }, [debouncedFilter, itemsPerPage, startTransition]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return;

    const offset = chatsRef.current.length;
    startTransition(async () => {
      const result = await getHistoryChatsAction({
        limit: itemsPerPage,
        offset,
        filter: debouncedFilter,
      });

      setChats((prev) => [...prev, ...result.chats]);
      setHasMore(result.hasMore);
    });
  }, [debouncedFilter, hasMore, isLoading, itemsPerPage, startTransition]);

  const { loader, scrollContainer } = useIntersectionObserver<
    HTMLUListElement,
    HTMLLIElement
  >({
    onIntersect: loadMore,
  });

  const onDeleteChat = useCallback(
    (chatId: string) => {
      setDeletingIds((prev) => new Set(prev).add(chatId));

      startTransition(async () => {
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
      });
    },
    [startTransition]
  );

  const onTogglePin = useCallback(
    (chatId: string) => {
      setPinningIds((prev) => new Set(prev).add(chatId));

      startTransition(async () => {
        try {
          // Optimistic update
          setChats((prev) =>
            prev
              .map((chat) =>
                chat.id === chatId ? { ...chat, pinned: !chat.pinned } : chat
              )
              // Only sort by updatedAt to keep consistent with server query, ignoring pinned status
              .sort((a, b) => {
                return (
                  new Date(b.updatedAt).getTime() -
                  new Date(a.updatedAt).getTime()
                );
              })
          );

          await togglePinChat(chatId);
          toast.success("Chat pin status updated");
        } catch (error) {
          console.error("Error toggling pin:", error);
          toast.error("Failed to update pin status");
          // Revert optimistic update
          const result = await getHistoryChatsAction({
            limit: chatsRef.current.length,
            offset: 0,
            filter: debouncedFilter,
          });
          setChats(result.chats);
        } finally {
          setPinningIds((prev) => {
            const next = new Set(prev);
            next.delete(chatId);
            return next;
          });
        }
      });
    },
    [debouncedFilter, startTransition]
  );

  const isDeleting = useCallback(
    (chatId: string) => deletingIds.has(chatId),
    [deletingIds]
  );

  const isPinning = useCallback(
    (chatId: string) => pinningIds.has(chatId),
    [pinningIds]
  );

  // Keep return object stable-ish for consumers.
  return useMemo(
    () => ({
      chats,
      hasMore,
      isLoading,
      filter,
      setFilter,
      isDeleting,
      onDeleteChat,
      isPinning,
      onTogglePin,
      scrollContainer,
      loader,
    }),
    [
      chats,
      hasMore,
      isLoading,
      filter,
      isDeleting,
      onDeleteChat,
      isPinning,
      onTogglePin,
      scrollContainer,
      loader,
    ]
  );
};
