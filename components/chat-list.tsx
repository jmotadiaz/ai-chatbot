import Link from "@/components/ui/link";
import { X as XIcon } from "lucide-react";
import { deleteChat } from "@/lib/ai/actions";
import { Chat } from "@/lib/db/schema";
import { ClassValue } from "clsx";
import { cn } from "../lib/utils";

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
      <h3 className="text-base font-semibold text-zinc-500 dark:text-zinc-300 mb-4">
        Chats
      </h3>
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
    <div className="flex items-center justify-between rounded-lg border dark:border-zinc-600 text-sm transition-colors hover:bg-accent select-none">
      <Link href={`/${id}`} className="flex-1 overflow-hidden">
        <div className="p-2 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
          {title || "Untitled Chat"}
        </div>
      </Link>
      <form action={deleteChat.bind(null, id)}>
        <button className="cursor-pointer py-2 pr-3" aria-label="Delete chat">
          <XIcon className="h-4 w-4" />
        </button>
      </form>
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
          <div
            key={index}
            className="flex items-center justify-between rounded-lg border dark:border-zinc-600 p-2"
          >
            <div className="h-5 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse flex-1 mr-3" />
            <div className="h-4 w-4 bg-zinc-300 dark:bg-zinc-600 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
};
