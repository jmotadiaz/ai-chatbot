"use client";
import { Edit } from "lucide-react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import type { ClassValue } from "clsx";
import { cn } from "@/lib/utils/helpers";
import ChatLink from "@/components/chat/link";
import { useChatContext } from "@/components/chat/provider";
import { useChatLifecycle } from "@/components/chat/lifecycle";

interface NewChatProps {
  children: React.ReactNode;
  temporary?: boolean;
  projectId?: string | null;
  /** Accessible name. Omit it when the link carries visible text of its own. */
  label?: string;
  /** Native tooltip; defaults to `label`. */
  title?: string;
  className?: ClassValue;
}

export const NewChatLink: React.FC<NewChatProps> = ({
  children,
  temporary,
  projectId,
  label,
  title,
  className,
}) => {
  const { status } = useChatContext();
  const { startNewChat } = useChatLifecycle();
  const router = useRouter();
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
      aria-label={label}
      title={title ?? label}
      className={cn(
        status === "streaming" || status === "submitted"
          ? "pointer-events-none opacity-50"
          : "cursor-pointer",
        className,
      )}
      onClick={handleClick}
      onNavigate={() => {
        router.refresh();
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
      <NewChatLink projectId={projectId} label="New chat">
        <div className="p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors">
          <Edit size={18} />
        </div>
      </NewChatLink>
    </Suspense>
  );
};
