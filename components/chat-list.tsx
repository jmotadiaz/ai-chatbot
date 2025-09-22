import { X as XIcon } from "lucide-react";
import { ClassValue } from "clsx";
import { cn } from "@/lib/utils";
import ChatLink from "@/components/chat-link";
import { deleteChat } from "@/lib/ai/actions/chat";
import { Chat } from "@/lib/db/schema";
import { Item } from "@/components/ui/item";
import { SidebarSectionTitle } from "@/components/sidebar";

export interface ChatListProps {
  chats: Chat[];
  className?: ClassValue;
}

export const ChatList: React.FC<ChatListProps> = async ({
  chats,
  className,
}) => {
  if (!chats.length) return null;

  return (
    <div className={cn("my-4", className)}>
      <SidebarSectionTitle>Chats</SidebarSectionTitle>
      <div className="space-y-3">
        {chats.map((chat) => (
          <ChatListItem key={chat.id} id={chat.id} title={chat.title} />
        ))}
      </div>
    </div>
  );
};

interface ChatListItemProps {
  id: string;
  title?: string | null;
}

const ChatListItem: React.FC<ChatListItemProps> = ({ id, title }) => {
  return (
    <Item className="py-0">
      <ChatLink href={`/${id}`} className="flex-1 py-2 overflow-hidden">
        <div className="whitespace-nowrap overflow-hidden text-ellipsis">
          {title || "Untitled Chat"}
        </div>
      </ChatLink>
      <form className="leading-0" action={deleteChat.bind(null, id)}>
        <button className="cursor-pointer" aria-label="Delete chat">
          <XIcon className="h-4 w-4" />
        </button>
      </form>
    </Item>
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
