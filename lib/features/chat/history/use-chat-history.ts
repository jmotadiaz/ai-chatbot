import { useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { deleteChat } from "@/lib/features/chat/actions";
import { normalize, toWords } from "@/lib/utils/helpers";
import { Chat } from "@/lib/features/chat/types";
import { useIntersectionObserver } from "@/lib/utils/hooks/intersection";

const ITEMS_PER_PAGE = 20;
const ITEMS_TO_TRIGGER_PAGINATION = 10;

export const useChatHistory = (initialChats: Chat[]) => {
  const [chats, setChats] = useState(initialChats);
  const [isLoading, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(ITEMS_PER_PAGE);

  const onIntersect = useCallback(() => {
    setOffset((prev) => prev + ITEMS_PER_PAGE);
  }, []);

  const { loader, scrollContainer } = useIntersectionObserver<
    HTMLUListElement,
    HTMLLIElement
  >({
    onIntersect,
  });

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await deleteChat(id);
        setChats((prev) => prev.filter((chat) => chat.id !== id));
        toast.success("Chat deleted successfully");
      } catch (error) {
        console.error("Error deleting chat:", error);
        toast.error("Failed to delete chat");
      }
    });
  };

  const normalizedFilter = normalize(filter);

  const filteredChats =
    normalizedFilter.length === 0
      ? chats
      : chats.filter(({ title }) => {
          const normalizedTitle = normalize(title || "");
          return toWords(normalizedFilter).every((word) =>
            normalizedTitle.includes(word)
          );
        });

  return {
    filteredChats,
    handleDelete,
    filter,
    setFilter,
    isLoading,
    loader,
    scrollContainer,
    offset,
    ITEMS_TO_TRIGGER_PAGINATION,
  };
};
