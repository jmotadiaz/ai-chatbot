"use client";
import { Edit, MessageCircleDashed } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { ClassValue } from "clsx";
import { cn } from "@/lib/utils/helpers";
import ChatLink from "@/components/chat-link";
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const baseTarget = projectId ? `/project/${projectId}/chat` : "/";

  const effectiveTemporary = temporary ?? (searchParams.get("chatType") === "temporary");

  return (
    <ChatLink
      href={{
        pathname: baseTarget,
        query: effectiveTemporary ? { chatType: "temporary" } : {},
      }}
      className="cursor-pointer"
      onClick={(e) => {
        if (pathname === baseTarget) {
          e.preventDefault();
          const newSearchParams = new URLSearchParams(
             effectiveTemporary ? { chatType: "temporary" } : {}
          );
          const queryString = newSearchParams.toString();
          const url = queryString ? `${baseTarget}?${queryString}` : baseTarget;
          window.location.assign(url);
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
      <div className={cn("flex items-center justify-between", className)}>
        <NewChatLink>
          <Item>
            <Edit className="h-4 w-4" /> New Chat
          </Item>
        </NewChatLink>
        <NewChatLink temporary={true}>
          <div className="p-2">
            <MessageCircleDashed className="h-5 w-5" />
          </div>
        </NewChatLink>
      </div>
    </Suspense>
  );
};
