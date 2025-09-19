"use client";
import { Edit } from "lucide-react";
import Link from "next/link";
import { useChatContext } from "@/app/providers";
import { cn } from "@/lib/utils";
import { SidebarSectionTitle } from "@/components/sidebar";

interface NewChatProps {
  children: React.ReactNode;
}

const NewChat: React.FC<NewChatProps> = ({ children }) => {
  const { status, setMessages } = useChatContext();
  return (
    <Link
      href="/"
      className={cn(
        "p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors",
        status === "streaming" || status === "submitted"
          ? "pointer-events-none opacity-50"
          : "cursor-pointer"
      )}
      onNavigate={() => {
        setMessages([]);
      }}
    >
      {children}
    </Link>
  );
};

export const NewChatHeader = () => {
  return (
    <NewChat>
      <Edit size={18} />
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
