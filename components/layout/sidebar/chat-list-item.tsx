"use client";
import { XIcon, Pin } from "lucide-react";
import { useTransition } from "react";
import ChatLink from "@/components/chat/link";
import { Item } from "@/components/ui/item";
import { deleteChat } from "@/lib/features/chat/actions";

interface ChatListItemProps {
  id: string;
  title?: string | null;
  pinned?: boolean;
  active?: boolean;
}

export const ChatListItem: React.FC<ChatListItemProps> = ({
  id,
  title,
  pinned,
  active,
}) => {
  const [isPending, startTransition] = useTransition();
  return (
    <Item className="py-0" loading={isPending} active={active}>
      <ChatLink
        href={`/chat/${id}`}
        className="flex-1 py-2 overflow-hidden flex items-center"
      >
        {pinned && (
          <Pin className="w-3 h-3 mr-2 shrink-0 text-primary fill-primary" />
        )}
        <div className="whitespace-nowrap overflow-hidden text-ellipsis">
          {title || "Untitled Chat"}
        </div>
      </ChatLink>
      <button
        className="pl-4 cursor-pointer"
        aria-label="Delete chat"
        onClick={() => {
          startTransition(async () => {
            await deleteChat(id);
          });
        }}
      >
        <XIcon className="h-4 w-4" />
      </button>
    </Item>
  );
};
