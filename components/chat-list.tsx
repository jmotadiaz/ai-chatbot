import Link from "next/link";
import { getChats } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { auth } from "@/auth";
import { deleteChat } from "@/app/(chat)/actions";

export async function ChatList({ limit = 10 }: { limit?: number }) {
  const session = await auth();
  if (!session?.user) return null;

  const userId = session.user.id;
  const chatData = await getChats({ userId, limit });

  if (!chatData.chats.length) return null;

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        {chatData.chats.map((chat) => (
          <div
            key={chat.id}
            className="flex items-center justify-between rounded-lg border p-3 text-sm transition-colors hover:bg-accent group"
          >
            <Link href={`/${chat.id}`} className="flex-1">
              <div className="font-medium">{chat.title || "Untitled Chat"}</div>
            </Link>
            <form action={deleteChat.bind(null, chat.id)}>
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="cursor-pointer"
                aria-label="Delete chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
