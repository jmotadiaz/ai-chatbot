"use client";
import { Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarSectionTitle } from "@/components/sidebar";
import ChatLink from "@/components/chat-link";
import { useChatContext } from "@/app/providers";

interface NewChatProps {
  children: React.ReactNode;
}

const NewChat: React.FC<NewChatProps> = ({ children }) => {
  const { status, setMessages } = useChatContext();
  return (
    <ChatLink
      href="/"
      className={cn(
        status === "streaming" || status === "submitted"
          ? "pointer-events-none opacity-50"
          : "cursor-pointer"
      )}
      onClick={() => setMessages([])}
    >
      {children}
    </ChatLink>
  );
};

export const NewChatHeader = () => {
  return (
    <NewChat>
      <div className="p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors">
        <Edit size={18} />
      </div>
    </NewChat>
  );
};

export const NewChatSidebar: React.FC = () => {
  return (
    <NewChat>
      <SidebarSectionTitle>
        New Chat <Edit className="h-4 w-4 ml-2" />
      </SidebarSectionTitle>
    </NewChat>
  );
};
