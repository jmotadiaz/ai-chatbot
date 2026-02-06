"use client";
import { Edit, MessageCircleDashed, LayoutGrid } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { ClassValue } from "clsx";
import { cn } from "@/lib/utils/helpers";
import ChatLink from "@/components/chat/link";
import { useChatContext } from "@/components/chat/provider";
import { useChatLifecycle } from "@/components/chat/lifecycle";
import { Item } from "@/components/ui/item";
import { MCPIcon } from "@/components/ui/icons";

interface NewChatProps {
  children: React.ReactNode;
  temporary?: boolean;
  projectId?: string | null;
}

export const NewChatLink: React.FC<NewChatProps> = ({
  children,
  temporary,
  projectId,
}) => {
  const { status } = useChatContext();
  const { startNewChat } = useChatLifecycle();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentChatType = searchParams.get("chatType");
  const isCurrentlyTemporary = currentChatType === "temporary";

  const targetPathname = projectId ? `/project/${projectId}/chat` : "/";
  const isOnTargetPath = pathname === targetPathname;
  // Check if clicking on same chat type (temporary -> temporary or regular -> regular)
  const isSameChatType = !!temporary === isCurrentlyTemporary;

  const handleClick = () => {
    // If we're already on the same path AND same chat type, start a new chat
    // This handles the case where Next.js won't trigger navigation for identical URLs
    if (isOnTargetPath && isSameChatType) {
      startNewChat();
    }
  };

  return (
    <ChatLink
      href={{
        pathname: targetPathname,
        query: temporary ? { chatType: "temporary" } : {},
      }}
      className={cn(
        status === "streaming" || status === "submitted"
          ? "pointer-events-none opacity-50"
          : "cursor-pointer",
      )}
      onClick={handleClick}
    >
      {children}
    </ChatLink>
  );
};

export interface NewChatHeaderProps {
  projectId?: string | null;
}

export const NewChatHeader = ({ projectId }: NewChatHeaderProps) => {
  return (
    <Suspense fallback={null}>
      <NewChatLink projectId={projectId}>
        <div className="p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors">
          <Edit size={18} />
        </div>
      </NewChatLink>
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
      <div className={cn("flex flex-col gap-1", className)}>
        <div className="flex items-center justify-between">
          <NewChatLink>
            <Item>
              <Edit size={18} /> New Chat
            </Item>
          </NewChatLink>
          <NewChatLink temporary>
            <div className="p-2">
              <MessageCircleDashed className="h-5 w-5" />
            </div>
          </NewChatLink>
        </div>

        <ChatLink href="/chat/hub">
          <Item>
            <LayoutGrid size={18} /> Chat Hub
          </Item>
        </ChatLink>
        <ChatLink href="/context7">
          <Item>
            <MCPIcon size={18} /> Context7 Chat
          </Item>
        </ChatLink>
      </div>
    </Suspense>
  );
};
