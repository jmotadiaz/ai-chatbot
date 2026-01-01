"use client";
import { Edit, MessageCircleDashed, LayoutGrid } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import type { ClassValue } from "clsx";
import { cn } from "@/lib/utils/helpers";
import ChatLink from "@/components/chat-link";
import { useChatContext } from "@/app/(chat)/chat-provider";
import { useChatLifecycle } from "@/app/(chat)/chat-lifecycle";
import { Item } from "@/components/ui/item";

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
  return (
    <ChatLink
      href={{
        pathname: projectId ? `/project/${projectId}/chat` : "/",
        query: temporary ? { chatType: "temporary" } : {},
      }}
      className={cn(
        status === "streaming" || status === "submitted"
          ? "pointer-events-none opacity-50"
          : "cursor-pointer"
      )}
      onNavigate={() => {
        if (pathname === "/" || pathname === `/project/${projectId}/chat`) {
          startNewChat();
        }
      }}
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
              <Edit className="h-4 w-4" /> New Chat
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
            <LayoutGrid className="h-4 w-4" /> Chat Hub
          </Item>
        </ChatLink>
      </div>
    </Suspense>
  );
};
