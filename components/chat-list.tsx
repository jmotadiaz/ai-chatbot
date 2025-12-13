import type { ClassValue } from "clsx";
import { cn } from "@/lib/utils";
import { type Chat } from "@/lib/types";
import { SidebarSectionTitle } from "@/components/sidebar";
import { ChatListItem } from "@/components/chat-list-item";

export interface ChatListProps {
  chats: Chat[];
  className?: ClassValue;
  chatId?: string | null | undefined;
}

export const ChatList: React.FC<ChatListProps> = async ({
  chats,
  className,
  chatId,
}) => {
  const filteredChats = chats.filter(({ id }) => id !== chatId);

  if (!filteredChats.length) return null;

  return (
    <div className={cn("my-4", className)}>
      <SidebarSectionTitle>Chats</SidebarSectionTitle>
      <div className="space-y-3" role="list" aria-label="Chat history">
        {filteredChats.map((chat) => (
          <ChatListItem key={chat.id} id={chat.id} title={chat.title} />
        ))}
      </div>
    </div>
  );
};

export const ChatListLoading: React.FC<{ className?: ClassValue }> = ({
  className,
}) => {
  return (
    <div className={cn("my-4", className)}>
      <h3 className="text-base font-semibold text-zinc-500 dark:text-zinc-300 mb-4">
        Chats
      </h3>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="flex" key={index}>
            <div className="h-5 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse flex-1 mr-3" />
            <div className="h-4 w-4 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
};
