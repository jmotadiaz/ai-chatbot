"use client";
import { XIcon } from "lucide-react";
import { useTransition } from "react";
import ChatLink from "@/components/chat-link";
import { Item } from "@/components/ui/item";
import { deleteChat } from "@/lib/features/chat/actions";

interface ChatListItemProps {
  id: string;
  title?: string | null;
}

export const ChatListItem: React.FC<ChatListItemProps> = ({ id, title }) => {
  const [isPending, startTransition] = useTransition();
  return (
    <Item className="py-0" loading={isPending}>
      <ChatLink href={`/${id}`} className="flex-1 py-2 overflow-hidden">
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
