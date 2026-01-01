import type { ClassValue } from "clsx";
import Link from "next/link";
import { Search, ArrowRight  } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { type Chat } from "@/lib/features/chat/types";
import { ChatListItem } from "@/components/chat-list-item";
import { SidebarSectionTitle } from "@/components/sidebar";

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
  if (!chats.length) return null;

  const filteredChats = chats.filter(({ id }) => id !== chatId);

  return (
    <div className={cn("my-4", className)}>
      <Link
        href="/chat/history"
        aria-label="Open chat history"
      >
        <SidebarSectionTitle>
          Chats <Search className="h-4 w-4 ml-3" />
        </SidebarSectionTitle>
      </Link>
      <div className="space-y-3" role="list" aria-label="Chat history">
        {filteredChats.map((chat) => (
          <ChatListItem key={chat.id} id={chat.id} title={chat.title} />
        ))}
      </div>
      <Link
        href="/chat/history"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-4 ml-1 transition-colors"
      >
        See all
        <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
};

export const ChatListLoading: React.FC<{ className?: ClassValue }> = ({
  className,
}) => {
  return (
    <div className={cn("my-4", className)}>
      <div className="flex items-center justify-between mb-4 pr-3">
        <h3 className="text-sm uppercase flex items-center font-medium text-zinc-500 dark:text-zinc-300 tracking-widest">
          Chats
        </h3>
        <Link
          href="/chat/history"
          aria-label="Open chat history"
          className="w-8 h-8 -mr-2 flex items-center justify-center rounded-md text-zinc-500 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          <Search className="w-4 h-4" />
        </Link>
      </div>
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
