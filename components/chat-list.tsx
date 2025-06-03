import Link from "next/link";
import { getChats } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { auth } from "@/auth";
import { deleteChat } from "@/lib/ai/actions";

export interface ChatListProps {
  limit?: number;
  chatId?: string;
}

export const ChatList: React.FC<ChatListProps> = async ({
  limit = 10,
  chatId = "",
}) => {
  const session = await auth();
  if (!session?.user) return null;

  const userId = session.user.id;
  const chatData = await getChats({ userId, limit });

  if (!chatData.chats.length) return null;

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        {chatData.chats
          .filter(({ id }) => id !== chatId)
          .map((chat) => (
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
    <div className="flex items-center justify-between rounded-lg border dark:border-zinc-600 p-3 text-sm transition-colors hover:bg-accent group">
      <Link href={`/${id}`} className="flex-1 overflow-hidden">
        <div className="font-medium whitespace-nowrap overflow-hidden text-ellipsis">
          {title || "Untitled Chat"}
        </div>
      </Link>
      <form action={deleteChat.bind(null, id)}>
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="cursor-pointer"
          aria-label="Delete chat"
        >
          <X className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};
