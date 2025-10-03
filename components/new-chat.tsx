"use client";
import { Edit, MessageCircleDashed } from "lucide-react";
import { useQueryState } from "nuqs";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { ClassValue } from "clsx";
import { cn } from "@/lib/utils";
import ChatLink from "@/components/chat-link";
import { useChatContext } from "@/app/(chat)/chat-provider";
import { Item } from "@/components/ui/item";

interface NewChatProps {
  children: React.ReactNode;
  temporary?: boolean;
}

const NewChat: React.FC<NewChatProps> = ({ children, temporary }) => {
  const { status, setMessages } = useChatContext();
  const [, setChatId] = useQueryState("chatId");
  const [, setChatType] = useQueryState("chatType");
  const pathname = usePathname();
  return (
    <ChatLink
      href="/"
      className={cn(
        status === "streaming" || status === "submitted"
          ? "pointer-events-none opacity-50"
          : "cursor-pointer"
      )}
      onNavigate={() => {
        if (pathname === "/") {
          setMessages([]);
        }
        setChatId(null);
        setChatType(temporary ? "temporary" : null);
      }}
    >
      {children}
    </ChatLink>
  );
};

export const NewChatHeader = () => {
  return (
    <Suspense fallback={null}>
      <NewChat>
        <div className="p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors">
          <Edit size={18} />
        </div>
      </NewChat>
    </Suspense>
  );
};

export interface NewChatSidebarProps {
  className?: ClassValue;
}

export const NewChatSidebar: React.FC<NewChatSidebarProps> = ({
  className,
}) => {
  return (
    <Suspense fallback={null}>
      <div className={cn("flex items-center justify-between", className)}>
        <NewChat>
          <Item>
            <Edit className="h-4 w-4" /> New Chat
          </Item>
        </NewChat>
        <NewChat temporary>
          <MessageCircleDashed className="h-5 w-5" />
        </NewChat>
      </div>
    </Suspense>
  );
};
