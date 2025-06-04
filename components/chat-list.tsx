import Link from "next/link";
import { getChats } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { X as XIcon } from "lucide-react";
import { auth } from "@/auth";
import { deleteChat } from "@/lib/ai/actions";

export interface ChatListProps {
  limit?: number;
}

export const ChatList: React.FC<ChatListProps> = async ({ limit = 10 }) => {
  const session = await auth();
  if (!session?.user) return null;

  const userId = session.user.id;
  const chatData = await getChats({ userId, limit });

  if (!chatData.chats.length) return null;

  return (
    <div className="p-4">
      <h3 className="text-base font-semibold text-zinc-500 dark:text-zinc-300 mb-2">
        Chats
      </h3>
      <div className="space-y-3">
        {chatData.chats.map((chat) => (
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
    <div className="flex items-center justify-between rounded-lg border dark:border-zinc-600 text-sm transition-colors hover:bg-accent group">
      <Link href={`/${id}`} className="flex-1 overflow-hidden">
        <div className="p-2 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
          {title || "Untitled Chat"}
        </div>
      </Link>
      <form action={deleteChat.bind(null, id)}>
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="cursor-pointer py-2 px-1"
          aria-label="Delete chat"
        >
          <XIcon className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};
